// 切手・紙の商品券など「現物」を撮影した写真から、枚数・額面を読み取り合計金額を算出するAPI。
// デジタル画面のスクショ読み取り(/api/scan-account)とはプロンプトが異なるため別エンドポイントにしている。

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { guardAiRead } from "@/lib/usageLimit";
import { buildScanDiagnostic, SCAN_DIAGNOSTIC_MARK } from "@/lib/scanDiagnostic"; // 診断(一時的)
import { PHYSICAL_SCAN_PROMPT } from "@/lib/physicalScanPrompt";

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

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
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
    const parsed = JSON.parse(cleaned);
    console.warn(buildScanDiagnostic(parsed, stopReason)); // 診断(一時的)

    return NextResponse.json(parsed);
  } catch (error) {
    console.error(error);
    console.warn(`${SCAN_DIAGNOSTIC_MARK} 応答を読めなかった stop_reason=${stopReason ?? "不明"}`); // 診断(一時的)
    // AIの呼び出しや結果の読み取りで失敗した分は、回数に含めない
    await refund?.();
    return NextResponse.json({ error: "読み取りに失敗しました" }, { status: 500 });
  }
}
