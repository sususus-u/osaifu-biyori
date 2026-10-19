// 切手・紙の商品券など「現物」を撮影した写真から、枚数・額面を読み取り合計金額を算出するAPI。
// デジタル画面のスクショ読み取り(/api/scan-account)とはプロンプトが異なるため別エンドポイントにしている。

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { guardAiRead } from "@/lib/usageLimit";

export async function POST(req: NextRequest) {
  // AI読み取りの回数を1つ使ったあとで失敗したときに、その1回分を戻すための関数。
  let refund: (() => Promise<void>) | null = null;
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
              text: `この写真には、切手や商品券・ギフトカードなどの現物が写っています。
以下の項目をJSON形式のみで返してください。前置きや説明文、コードブロックの記号は一切付けないでください。

- 写っている枚数を数えてください
- 切手の場合の注意: 額面は「84」「63」「10」のような小さな数字で、「円」の記号がないことが多いです。数字を1枚ずつ確認してください。1枚の写真に複数枚(切手シートやバラ)が写ることが多く、シートは行×列で枚数を数えてください。記念切手は図柄が大きく、額面は隅に小さく書かれています。切手に有効期限は通常ないので、expiryDateはnullにしてください
- 各枚に印刷されている額面(金額)が読み取れれば、それを合計してください。額面がバラバラな場合はすべて合計してください
- 何の商品券/切手か、名前が印刷されていれば読み取ってください(例:「図書カード」「Amazonギフト券」「切手」など)
  name(商品名)は、文字がはっきり読み取れる場合のみ回答してください。手書き文字などで判読に自信が持てない場合は、無理に推測せず、必ずnullを返してください。誤った名前を返すより、nullにしてユーザーに手入力してもらう方が安全です。
- 額面ごとに「額面×枚数」の小計をbreakdownに書き、totalAmountはその小計の合計、itemCountは枚数の合計に必ず一致させてください。額面が読めない枚があるときは、推測せず totalAmount を null にしてください
- 有効期限が印刷されていれば読み取ってください(印刷されていないことも多いので、その場合はnull)
- 写っているすべての商品券・切手の額面が同じ場合、その1枚あたりの額面もfaceValuePerItemとして返してください(額面がバラバラな場合や読み取れない場合はnull)

{
  "breakdown": [{ "faceValue": 数値のみ(1枚の額面), "count": 数値のみ(その額面の枚数) }],
  "name": "商品名(読み取れない場合はnull)",
  "itemCount": 数値のみ(枚数、読み取れない場合はnull),
  "totalAmount": 数値のみ(合計金額。カンマなし。読み取れない場合はnull),
  "faceValuePerItem": 数値のみ(1枚あたりの額面。バラバラ・不明ならnull),
  "expiryDate": "YYYY-MM-DD形式(読み取れない場合はnull)"
}`,
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error(error);
    // AIの呼び出しや結果の読み取りで失敗した分は、回数に含めない
    await refund?.();
    return NextResponse.json({ error: "読み取りに失敗しました" }, { status: 500 });
  }
}
