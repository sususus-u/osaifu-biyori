// 運営者(ADMIN_UID)の端末にだけ送るプッシュ通知の、Firestore に依存しない部分(依頼245)。
// AI の利用額の上限([AI_PAUSED])と、全員の合計の1日の上限([AI_DAILY_BUDGET])に届いたときに使う。
// 回数は、たべびよりと同じく、全体で10分に1回・1日に10回まで。2つの用途で同じ枠を使う。
// 文の決まり(たべびよりの notifyText.js、依頼227と同じ考え方):
//   - 題には「おさいふびより(運営者向け):」と、何の知らせかを入れる。
//   - 急がせる言い方と、絵文字(⚠️ など)は使わない。利用者が送った文は入れない。

export const ADMIN_PUSH_LIMITS = [
  { ms: 10 * 60 * 1000, max: 1 },
  { ms: 24 * 60 * 60 * 1000, max: 10 },
] as const;

// 送った時刻の記録: notify_counts_tamari/admin-push = { times: [ミリ秒...], expireAt }
// (Admin SDK だけが読み書きする。ルールに書いていないコレクションなので、画面からは読み書きできない)
export const ADMIN_PUSH_COLLECTION = "notify_counts_tamari";
export const ADMIN_PUSH_DOC = "admin-push";

export const ADMIN_AI_PAUSED = {
  title: "おさいふびより(運営者向け):AI の読み取りの停止",
  body: "AI の利用額の上限に届いたため、スクショと現物の写真の読み取りを止めています。利用者には、手入力で登録できることを案内しています。",
} as const;

export const ADMIN_AI_DAILY_BUDGET = {
  title: "おさいふびより(運営者向け):AI の読み取りの停止",
  body: "全員の合計の、AI の1日の上限に届いたため、今日は、スクショと現物の写真の読み取りを止めています。日本時間の0時に戻ります。",
} as const;

// 保存済みの時刻から、今回送ってよいかを決める。送ってよいときは、今回の時刻を足した記録を返す。
// 一番長い窓より古い時刻と、数でない値は捨てる。
export function nextPushTimes(
  saved: unknown,
  nowMs: number,
  limits: ReadonlyArray<{ ms: number; max: number }> = ADMIN_PUSH_LIMITS,
): number[] | null {
  const longest = Math.max(...limits.map((w) => w.ms));
  const times = (Array.isArray(saved) ? saved : []).filter(
    (t): t is number => typeof t === "number" && Number.isFinite(t) && nowMs - t < longest,
  );
  for (const w of limits) {
    if (times.filter((t) => nowMs - t < w.ms).length >= w.max) return null;
  }
  return [...times, nowMs];
}

// 送り先の端末のトークン(users/{ADMIN_UID}.fcmTokens)。文字列でないものは除く。
export function adminTokens(userData: unknown): string[] {
  const d = (userData && typeof userData === "object" ? userData : {}) as Record<string, unknown>;
  return Array.isArray(d.fcmTokens) ? d.fcmTokens.filter((t): t is string => typeof t === "string" && t !== "") : [];
}
