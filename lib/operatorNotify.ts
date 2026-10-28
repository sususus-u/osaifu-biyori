// 運営者への知らせ(依頼253。依頼245の lib/adminPush.ts を置き換えた)。
// 自分で運営者の端末へ通知を送らず、ホームの運営者あての窓口(POST /api/operator-notify)を呼ぶ。
// 題と本文(「【運営者向け】おさいふびより:…」)と、回数の制限(同じ種類は10分に1回、全体で1日に10回)は、
// ホームが受け持つ。ここでは、送る種類だけを渡す。
// AI の利用額の上限([AI_PAUSED])は "ai-budget-limit"、全員の合計の1日の上限([AI_DAILY_BUDGET])は "ai-daily-limit"。
// ホームが止まっていても、利用者への応答を長く待たせない(3秒で打ち切る)。例外は投げない。
// ログには、応答の番号と種類だけを出す(鍵・uid・トークンは出さない)。
// 応答: 200 送った、401 鍵が違う、503 ホームの準備ができていない、429 回数の制限、404 運営者の端末がない、400 中身が違う。

export const OPERATOR_NOTIFY_URL = "https://okizukibiyori.com/api/operator-notify";
export const OPERATOR_NOTIFY_SERVICE = "tamari-biyori";
export const OPERATOR_NOTIFY_TIMEOUT_MS = 3000;

// "ai-key-error" は、AI の鍵が使えないとき(401。依頼295)。
export type OperatorNotifyKind = "ai-budget-limit" | "ai-daily-limit" | "ai-key-error";

// 送る中身を作る(鍵がなければ null。送らない)。
export function buildOperatorNotifyRequest(
  kind: OperatorNotifyKind,
  key: string | undefined,
): { url: string; init: RequestInit } | null {
  if (!key) return null;
  return {
    url: OPERATOR_NOTIFY_URL,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", "x-dashboard-key": key },
      body: JSON.stringify({ service: OPERATOR_NOTIFY_SERVICE, kind }),
    },
  };
}

// 窓口を呼ぶ。送れたら true。失敗・時間切れ・鍵なしは false(例外は投げない)。
export async function notifyOperator(
  kind: OperatorNotifyKind,
  options: { key?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> {
  try {
    const req = buildOperatorNotifyRequest(kind, "key" in options ? options.key : process.env.DASHBOARD_API_KEY);
    if (!req) return false;
    const doFetch = options.fetchImpl ?? fetch;
    const ms = options.timeoutMs ?? OPERATOR_NOTIFY_TIMEOUT_MS;
    // 打ち切りの合図(signal)を無視する fetch でも、決まった時間で待つのをやめる
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms);
    });
    const res = await Promise.race([
      doFetch(req.url, { ...req.init, signal: AbortSignal.timeout(ms) }),
      timeout,
    ]).finally(() => clearTimeout(timer));
    if (res.status !== 200) console.warn("operator notify", kind, res.status);
    return res.status === 200;
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "unknown";
    console.warn("operator notify failed", kind, name);
    return false;
  }
}
