import { CATEGORY_DEFAULTS } from "../types/firestore.ts";
import { DAILY_NOTIFY_FROM_DAYS, DASHBOARD_OVERDUE_DAYS } from "./notificationSchedule.ts";
import {
  REMINDER_CHOICES,
  REMINDER_DEFAULT_DAYS,
  REMINDER_FREE_MAX,
  REMINDER_PAID_MAX,
} from "./reminderTiming.ts";

// 通知と「期限が近いもの」の数(ホームの「通知と表示の決まり」のページが読む。依頼288)。
// 数は、作りの中の設定から出す: お知らせの日数は lib/reminderTiming.ts、時刻は vercel.json の送る時刻。
// 依頼317 仕事1: 種類ごとの違いをやめたので、categories の firstDays は、どれもデフォルトの60。
// secondDays(前の「2回目」)は、やめたが、ホームの今の読み方を壊さないよう、数(0)のまま残す。
// 選べる日数などは notify.reminder に足した(新しいホームが読む)。

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
        firstDays: REMINDER_DEFAULT_DAYS,
        secondDays: 0,
      })),
      dailyFromDays: DAILY_NOTIFY_FROM_DAYS,
      reminder: {
        choices: [...REMINDER_CHOICES],
        defaultDays: REMINDER_DEFAULT_DAYS,
        allowNone: true,
        freeMax: REMINDER_FREE_MAX,
        paidMax: REMINDER_PAID_MAX,
      },
    },
    dashboard: { overdueDays: DASHBOARD_OVERDUE_DAYS, maxItems: 3 },
  };
}
