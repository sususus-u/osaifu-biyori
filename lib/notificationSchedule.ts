// 期限のお知らせを、その日に送るかどうか(app/api/send-notifications。依頼289、依頼317 仕事1)。
// - 気づきのお知らせ: 選んだ日(○日前)に1回ずつ(選ぶ日とプランの決まりは lib/reminderTiming.ts)。
// - 直前のお知らせ: 期限の7日前から当日まで、毎朝(3つのサービスでそろえた)。
// - 2回目のお知らせ(前の形の secondStageDays)は、やめた。保存してある値は読まない(消さない)。
// 決まり(同じ日に2通は送らない):
//   1. 期限が過ぎたもの(あと0日より前)には、送らない。
//   2. 1つのポイント・残高に、同じ日に送るのは1通だけ。その日に送った印(notifiedOn。前の形の notifiedDailyOn も見る)が
//      今日なら、何も送らない(同じ日に2回呼ばれても重ならない)。
//   3. 7日前から当日までは、直前のお知らせ1通だけ。気づきの日がこの中に入っても、気づきは別に送らない。
//   4. それより前は、気づきの日(プランで効く日)に当たる日だけ、気づきのお知らせを1通。
// ホームの「期限が近いもの」は、期限が過ぎてから7日だけ出す(app/api/dashboard-items)。

export const DAILY_NOTIFY_FROM_DAYS = 7;
export const DASHBOARD_OVERDUE_DAYS = 7;

// reminder = 気づきのお知らせ、daily = 直前のお知らせ
export type NotifyStage = "reminder" | "daily";

export function pickNotifyStage(input: {
  daysUntilExpiry: number;
  // 選んだ気づきの日(lib/reminderTiming.ts の effectiveReminderDays。プランでは絞らない。依頼372)
  reminderDays: readonly number[];
  todayIso: string;
  notifiedOn?: string | null;
  notifiedDailyOn?: string | null;
}): NotifyStage | null {
  const d = input.daysUntilExpiry;
  if (d < 0) return null;
  if (input.notifiedOn === input.todayIso || input.notifiedDailyOn === input.todayIso) return null;
  if (inDailyWindow(d)) return "daily";
  if (input.reminderDays.includes(d)) return "reminder";
  return null;
}

export function inDailyWindow(daysUntilExpiry: number): boolean {
  return daysUntilExpiry >= 0 && daysUntilExpiry <= DAILY_NOTIFY_FROM_DAYS;
}

// 本文(急がせる言い方はしない。「そろそろ」は使わない)
export function notifyBody(_stage: NotifyStage, name: string, daysUntilExpiry: number): string {
  if (daysUntilExpiry === 0) return `${name}、期限は今日です`;
  return `${name}、期限まであと${daysUntilExpiry}日です`;
}
