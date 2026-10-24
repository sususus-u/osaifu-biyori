// 画面が、保存前の件数の上限の確認に使う情報(プラン、上限、強制のオン・オフ)を返す。
// 強制のスイッチ ENFORCE_PLAN_LIMITS はサーバー側の環境変数なので、画面はここから知る(NEXT_PUBLIC_ にしない:
// ビルド時に値が固定され、切り替えに再デプロイが要るため)。ログイン必須(IDトークンの検証。uid は画面から受け取らない)。
import { NextRequest, NextResponse } from "next/server";
import { verifyBearerIdToken } from "@/lib/verifyIdToken";
import { getPlan, isPlanEnforced, PLAN_LIMITS } from "@/lib/planLimits";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const uid = await verifyBearerIdToken(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
  }
  const plan = await getPlan(uid);
  return NextResponse.json(
    { plan, maxRecords: PLAN_LIMITS[plan].maxRecords, enforced: isPlanEnforced() },
    { headers: NO_STORE },
  );
}
