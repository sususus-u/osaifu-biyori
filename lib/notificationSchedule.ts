// 期限のお知らせを、その日に送るかどうか(app/api/send-notifications。依頼289)。
// - 1回目・2回目: 決めた日(○日前)に、1回ずつ(今までどおり)。
// - 期限の7日前から当日までは、毎朝送る(3つのサービスでそろえた)。同じ日に2回は送らない。
// ホームの「期限が近いもの」は、期限が過ぎてから7日だけ出す(app/api/dashboard-items)。

export const DAILY_NOTIFY_FROM_DAYS = 7;
export const DASHBOARD_OVERDUE_DAYS = 7;

export type NotifyStage = "first" | "second" | "daily";

export function pickNotifyStage(input: {
  daysUntilExpiry: number;
  firstStageDays: number;
  secondStageDays: number;
  expiryIso: string;
  todayIso: string;
  notifiedFirstStageForDate?: string | null;
  notifiedSecondStageForDate?: string | null;
  notifiedDailyOn?: string | null;
}): NotifyStage | null {
  const d = input.daysUntilExpiry;
  // 同じ日に、7日前からの毎朝の分を送っていれば、1回目・2回目も重ねて送らない
  if (input.notifiedDailyOn === input.todayIso) return null;
  if (d === input.secondStageDays && input.notifiedSecondStageForDate !== input.expiryIso) return "second";
  if (d === input.firstStageDays && input.notifiedFirstStageForDate !== input.expiryIso) return "first";
  if (inDailyWindow(d)) return "daily";
  return null;
}

export function inDailyWindow(daysUntilExpiry: number): boolean {
  return daysUntilExpiry >= 0 && daysUntilExpiry <= DAILY_NOTIFY_FROM_DAYS;
}

export function notifyBody(stage: NotifyStage, name: string, daysUntilExpiry: number): string {
  if (stage === "first") return `${name}、そろそろ確認のタイミングです`;
  if (daysUntilExpiry === 0) return `${name}、期限は今日です`;
  return `${name}、期限まであと${daysUntilExpiry}日です`;
}
