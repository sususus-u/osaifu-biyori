// 切手・紙の商品券など「現物」を撮影した写真から、枚数・額面を読み取り合計金額を算出するAPI。
// デジタル画面のスクショ読み取り(/api/scan-account)とはプロンプトが異なるため別エンドポイントにしている。

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { guardAiRead } from "@/lib/usageLimit";
import { buildScanDiagnostic, SCAN_DIAGNOSTIC_MARK } from "@/lib/scanDiagnostic"; // 診断(一時的)
import { PHYSICAL_SCAN_PROMPT } from "@/lib/physicalScanPrompt";
import { resolvePhysicalScanModel } from "@/lib/physicalScanModel";
import { readWithRetry, type ScanAttempt } from "@/lib/physicalScanRetry";

// AI を最大2回(再試行込み)呼んでも収まるように、関数の時間制限を明示する。
// 1回目が遅かったときは再試行しない(RETRY_SKIP_AFTER_MS)ので、合計は 60 秒を超えない見込み。
export const maxDuration = 60;

// AI の返答の最大トークン数。Sonnet は考える分も数えるため、500 では JSON の途中で切れることがあった
const SCAN_MAX_TOKENS = 1000;

export async function POST(req: NextRequest) {
  // AI読み取りの回数を1つ使ったあとで失敗したときに、その1回分を戻すための関数。
  let refund: (() => Promise<void>) | null = null;
  let stopReason: string | null = null; // 診断(一時的)
  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "画像がありません" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "サーバー側にAPIキーが設定されていません" },
        { status: 500 }
      );
    }

    // 入力が正しいときだけ、アカウントごとの1日の回数を1つ使う(上限なら429を返し、AIは呼ばない)。
    const guard = await guardAiRead(req.headers.get("authorization"));
    if (!guard.ok) return guard.response;
    refund = guard.refund;

    const anthropic = new Anthropic({ apiKey });
    const { model, warning } = resolvePhysicalScanModel(process.env.SCAN_PHYSICAL_MODEL);
    if (warning) console.warn(warning);

    const callAi = async (): Promise<ScanAttempt> => {
      const message = await anthropic.messages.create({
        model,
        max_tokens: SCAN_MAX_TOKENS,
        thinking: { type: "disabled" }, // 考える出力を使わない(JSON が途中で切れるのを防ぐ)
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: PHYSICAL_SCAN_PROMPT,
              },
            ],
          },
        ],
      });

      const textBlock = message.content.find((block) => block.type === "text");
      const rawText = textBlock && "text" in textBlock ? textBlock.text : "{}";
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      stopReason = message.stop_reason; // 診断(一時的)
      try {
        return { parsed: JSON.parse(cleaned), stopReason: message.stop_reason };
      } catch {
        // JSON として読めない(途中で切れた等)。再試行の対象にする。応答の全文は出さない
        return { parsed: null, stopReason: message.stop_reason, parseFailed: true };
      }
    };

    // 全項目 null のときだけ、同じ画像で1回呼び直す(利用回数は guardAiRead の1回分のまま)
    const result = await readWithRetry(callAi);
    result.attempts.forEach((a, i) => {
      // 診断(一時的)
      const note = `試行=${i + 1}/${result.attempts.length} 再試行=${result.retried ? "あり" : result.skippedBySlow ? "なし(1回目が遅い)" : "なし"}`;
      console.warn(buildScanDiagnostic(a.parsed, a.stopReason, note));
    });
    const parsed = result.attempts[result.attempts.length - 1].parsed;
    // 再試行しても JSON が読めなかったときは、今までどおり失敗として返す(回数は戻す)
    if (parsed === null) throw new Error("AIの応答をJSONとして読めなかった");

    return NextResponse.json(parsed);
  } catch (error) {
    console.error(error);
    console.warn(`${SCAN_DIAGNOSTIC_MARK} 応答を読めなかった stop_reason=${stopReason ?? "不明"}`); // 診断(一時的)
    // AIの呼び出しや結果の読み取りで失敗した分は、回数に含めない
    await refund?.();
    return NextResponse.json({ error: "読み取りに失敗しました" }, { status: 500 });
  }
}
