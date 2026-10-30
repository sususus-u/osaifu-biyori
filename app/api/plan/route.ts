// 「お知らせの時期」の画面が、その人のプランを知るための窓口(依頼317 仕事1)。
// - ログイン(Authorization: Bearer <IDトークン>)を確かめ、トークンの uid だけを使う(画面から uid は受け取らない)。
// - プランは、AI の読み取りの回数と同じ部品で読む(lib/usageLimit.ts の planFor → lib/plan-resolve.ts の readPlanWithIdToken)。
//   上限の強制(ENFORCE_PLAN_LIMITS)がオフの間は、記録を読まずに "free"(みな1つだけ選べる)。
// - 読めないときも、例外にせず "free" を返す(画面は、無料の決まりで動く)。
// 返すのはプランの名前だけ(支払いの記録などは返さない)。

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerIdToken } from "@/lib/verifyIdToken";
import { planFor } from "@/lib/usageLimit";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  const uid = await verifyBearerIdToken(authorization);
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const idToken = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  try {
    const plan = await planFor(uid, idToken);
    return NextResponse.json({ plan }, { headers: NO_STORE });
  } catch (error) {
    console.error("plan read error", error);
    return NextResponse.json({ plan: "free" }, { headers: NO_STORE });
  }
}
