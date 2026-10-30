// 「お知らせ」の画面の「あなたへのお知らせ」に出す、お知らせの時期に入ったポイント・残高(依頼318。新しいデータは作らない)。
// 依頼317 仕事1(決定15「通知を送ったものは、全部ベルにも出す」)で、範囲を広げた:
// - 気づきのお知らせ: そのポイント・残高の、いちばん早い気づきの日(例:60日前)から当日まで出す。
//   無料のプランでも効くのは、いちばん早い日なので、プランを読まなくても、送ったものと同じになる。
// - 直前のお知らせ: 7日前から当日まで(気づきが「なし」でも出す)。
// - 期限が過ぎたものは出さない(お知らせも、当日までしか送らない)。
// 日数の数え方も、お知らせとそろえる: 期限は保存した日付(UTC の日付)、今日は日本時間の日付。

import { DAILY_NOTIFY_FROM_DAYS } from "./notificationSchedule.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// 一覧の上のひとこと
export const DUE_SOON_LEAD = "お知らせの時期に入ったポイント・残高です（期限の近い順）。";

// 期限まで、あと何日か(当日は0、過ぎたら負)。日付の形でないときは null
export function daysUntil(expiryIso: string, todayIso: string): number | null {
  if (!ISO_DATE.test(expiryIso) || !ISO_DATE.test(todayIso)) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${expiryIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / msPerDay);
}

// 出すものを、期限の近い順に(同じ日は、渡された順のまま)。
// fromDays は、そのポイント・残高のいちばん早い気づきの日(なし・不明は null。7日前からは、いつも出す)
export function pickDueSoon<T extends { expiryIso: string | null; fromDays?: number | null }>(
  items: T[],
  todayIso: string,
): (T & { days: number })[] {
  const out: (T & { days: number })[] = [];
  for (const item of items) {
    if (!item.expiryIso) continue;
    const days = daysUntil(item.expiryIso, todayIso);
    const from = Math.max(DAILY_NOTIFY_FROM_DAYS, item.fromDays ?? 0);
    if (days === null || days < 0 || days > from) continue;
    out.push({ ...item, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

// 名前の下の小さな文字
export function dueSoonText(days: number, expiryIso: string): string {
  if (days === 0) return "今日が期限です";
  const [, month, day] = expiryIso.split("-").map(Number);
  return `あと${days}日（${month}月${day}日まで）`;
}
