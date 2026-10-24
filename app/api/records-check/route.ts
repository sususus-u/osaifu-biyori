// 保存前の件数の確認を、ハブ(/api/records/check)へ中継する。ハブは CORS を開けていないので、ブラウザから直接は呼べない。
// ログイン必須(IDトークンの検証)。トークンはそのままハブへ渡す(ハブも自分で検証する)。appId はここで固定する。
// ハブのアドレスは環境変数 HUB_RECORDS_CHECK_URL(未設定なら本番のハブ)。ハブが遅い・落ちているときは、
// 4秒で切って 504 を返す(画面側は、5xx を許可として扱い、保存を止めない)。ログには種類だけ出す。
import { NextRequest, NextResponse } from "next/server";
import { verifyBearerIdToken } from "@/lib/verifyIdToken";

const DEFAULT_URL = "https://okizukibiyori.com/api/records/check";
const RELAY_TIMEOUT_MS = 4000;
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  const uid = await verifyBearerIdToken(authorization);
  if (!uid || !authorization) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
  }
  const body = (await req.json().catch(() => null)) as { adding?: unknown } | null;
  const adding = body?.adding;
  if (typeof adding !== "number" || !Number.isInteger(adding) || adding < 0 || adding > 1000) {
    return NextResponse.json({ error: "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  }
  try {
    const hubRes = await fetch(process.env.HUB_RECORDS_CHECK_URL || DEFAULT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify({ appId: "tamari-biyori", adding }),
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      cache: "no-store",
    });
    const data: unknown = await hubRes.json().catch(() => null);
    if (!hubRes.ok) {
      console.error("records-check relay: hub-http", hubRes.status);
      return NextResponse.json({ error: "hub" }, { status: hubRes.status >= 500 ? 502 : 400, headers: NO_STORE });
    }
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (e) {
    console.error("records-check relay:", e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network");
    return NextResponse.json({ error: "hub" }, { status: 504, headers: NO_STORE });
  }
}
