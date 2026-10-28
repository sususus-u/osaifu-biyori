import { CATEGORY_DEFAULTS } from "../types/firestore.ts";
import { DAILY_NOTIFY_FROM_DAYS, DASHBOARD_OVERDUE_DAYS } from "./notificationSchedule.ts";

// 通知と「期限が近いもの」の数(ホームの「通知と表示の決まり」のページが読む。依頼288)。
// 数は、作りの中の設定から出す: 通知の日数は CATEGORY_DEFAULTS、時刻は vercel.json の送る時刻。

// "分 時 * * *"(協定世界時)を、日本時間の時に直す。読めないときは null。
export function jstHourFromCron(schedule: string | undefined): number | null {
  const m = /^(\d+) (\d+) \* \* \*$/.exec(schedule ?? "");
  return m ? (Number(m[2]) + 9) % 24 : null;
}

export function notificationRules(crons: { path: string; schedule: string }[]) {
  const send = crons.find((c) => c.path === "/api/send-notifications");
  return {
    version: 1,
    service: "tamari",
    notifyHourJst: jstHourFromCron(send?.schedule),
    notify: {
      categories: Object.values(CATEGORY_DEFAULTS).map((c) => ({
        label: c.label,
        firstDays: c.notificationDaysBefore[0],
        secondDays: c.notificationDaysBefore[1],
      })),
      dailyFromDays: DAILY_NOTIFY_FROM_DAYS,
    },
    dashboard: { overdueDays: DASHBOARD_OVERDUE_DAYS, maxItems: 3 },
  };
}
