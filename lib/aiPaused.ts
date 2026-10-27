// AI の利用額の上限(Claude Console の Spend limits)に届いたときの扱い(依頼214、点検の M8)。
// 上限に届くと、その月は Anthropic API が 400 の invalid_request_error で断る。
// そのときだけ、通信の失敗などとは別の印(503 と code: "ai_paused")を画面に返し、
// ログに決まった印 [AI_PAUSED] を出し、ホームの運営者あての窓口で運営者に知らせる(依頼253、lib/operatorNotify.ts)。画面は、サーバーの文(error)をそのまま出す(readScanJson)。

export const AI_PAUSED = "ai_paused";
export const AI_PAUSED_MESSAGE = "ただいま AI の読み取りを休んでいます。手入力で登録できます。";
export const AI_PAUSED_LOG_MARK = "[AI_PAUSED]";

// 利用額の上限、またはクレジットの残高切れによる断りか。どちらも、待っても直らない。
// error は Anthropic SDK の APIError(status と、本文の error を持つ)。
export function isSpendLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; error?: unknown; message?: unknown };
  if (e.status !== 400) return false;
  let body = "";
  try {
    body = JSON.stringify(e.error ?? "");
  } catch {
    body = "";
  }
  const text = `${body} ${typeof e.message === "string" ? e.message : ""}`;
  if (!text.includes("invalid_request_error")) return false;
  return /usage limit|spend limit|credit balance/i.test(text);
}

// 画面に返す本文(状態は 503)。
export function aiPausedBody() {
  return { error: AI_PAUSED_MESSAGE, code: AI_PAUSED };
}

// ログの1行。読み取った内容やエラーの全文は出さない。
export function aiPausedLog(route: string): string {
  return `${AI_PAUSED_LOG_MARK} osaifu-biyori ${route}: AI の利用額の上限に届いています`;
}
