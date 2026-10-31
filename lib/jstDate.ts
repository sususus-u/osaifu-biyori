// 日本時間の日付の部品(依頼365 決定7)。おさいふびよりの「今日」は、端末やサーバー(Vercel は世界標準時)の時間帯によらず、
// 日本時間の0時で切り替える。たべびよりの shared/jstDate.js、まもりびよりの src/lib/jst-date.ts と同じ考え。
// 使う所: ホームの「期限が近いもの」の残りの日数(app/api/dashboard-items)、通知の処理(app/api/send-notifications)、
// 画面の「期限が過ぎた」の切り替わり(components/AccountRow.tsx)、「あなたへのお知らせ」(app/notifications)。
//
// 期限(expiryDate)は、入力の日付 "YYYY-MM-DD" を new Date("YYYY-MM-DD")(世界標準時の0時)で保存している。
// なので、期限の暦の日付は、保存した時刻の世界標準時の日付(expiryIsoOf)。日本時間に直すと9時になるので、
// 時刻のまま「今」と比べると、期限の当日の9時に「過ぎた」になってしまう(前の形)。暦の日付どうしで比べる。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 日本時間の今日("YYYY-MM-DD")。now は Date か、ミリ秒 */
export function jstToday(now: Date | number = Date.now()): string {
  const ms = now instanceof Date ? now.getTime() : now;
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 保存した期限(世界標準時の0時)の暦の日付("YYYY-MM-DD")。読めない時刻は null */
export function expiryIsoOf(expiry: Date): string | null {
  const ms = expiry.getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

function dayNumber(iso: string): number {
  const m = ISO_DATE.exec(iso);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

/** 日本時間の今日から、暦の日付 iso まで何日か(当日は0、過ぎたら負)。読めない日付は NaN */
export function daysFromToday(iso: string, now: Date | number = Date.now()): number {
  return dayNumber(iso) - dayNumber(jstToday(now));
}

/** 保存した期限まで、日本時間の暦で何日か(当日は0、過ぎたら負)。読めない期限は NaN */
export function daysUntilExpiry(expiry: Date, now: Date | number = Date.now()): number {
  const iso = expiryIsoOf(expiry);
  return iso === null ? Number.NaN : daysFromToday(iso, now);
}

/** 期限が過ぎたか(期限の次の日の、日本時間の0時から true) */
export function isPastExpiry(expiry: Date, now: Date | number = Date.now()): boolean {
  return daysUntilExpiry(expiry, now) < 0;
}
