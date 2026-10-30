// 「お知らせ」の画面の「あなたへのお知らせ」に出す、期限が近いポイント・残高(依頼318。新しいデータは作らない)。
// 出す範囲は、期限のお知らせ(app/api/send-notifications)の「7日前から当日までは毎朝」とそろえる。
// - 1回目・2回目のお知らせ(90日前・1年前など)の日数までは広げない(ほとんど全部が並び、「近いもの」にならないため)。
// - 期限が過ぎたものは出さない(お知らせも、当日までしか送らない)。
// 日数の数え方も、お知らせとそろえる: 期限は保存した日付(UTC の日付)、今日は日本時間の日付。

import { DAILY_NOTIFY_FROM_DAYS } from "./notificationSchedule.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// 期限まで、あと何日か(当日は0、過ぎたら負)。日付の形でないときは null
export function daysUntil(expiryIso: string, todayIso: string): number | null {
  if (!ISO_DATE.test(expiryIso) || !ISO_DATE.test(todayIso)) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${expiryIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / msPerDay);
}

// 出すものを、期限の近い順に(同じ日は、渡された順のまま)
export function pickDueSoon<T extends { expiryIso: string | null }>(items: T[], todayIso: string): (T & { days: number })[] {
  const out: (T & { days: number })[] = [];
  for (const item of items) {
    if (!item.expiryIso) continue;
    const days = daysUntil(item.expiryIso, todayIso);
    if (days === null || days < 0 || days > DAILY_NOTIFY_FROM_DAYS) continue;
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
