import { test } from "node:test";
import assert from "node:assert/strict";
import { DAILY_NOTIFY_FROM_DAYS, DASHBOARD_OVERDUE_DAYS, notifyBody, pickNotifyStage } from "./notificationSchedule.ts";
import { effectiveReminderDays, selectedReminderDays } from "./reminderTiming.ts";

const base = { reminderDays: [60] as number[], todayIso: "2026-11-25" };

test("日数は7日", () => {
  assert.equal(DAILY_NOTIFY_FROM_DAYS, 7);
  assert.equal(DASHBOARD_OVERDUE_DAYS, 7);
});

test("気づきのお知らせは、選んだ日(プランで効く日)に1回ずつ", () => {
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 60 }), "reminder");
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 59 }), null);
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 120 }), null);
  assert.equal(pickNotifyStage({ ...base, reminderDays: [120, 60, 30], daysUntilExpiry: 30 }), "reminder");
  assert.equal(pickNotifyStage({ ...base, reminderDays: [], daysUntilExpiry: 60 }), null);
});

test("直前のお知らせは、7日前から当日まで毎朝。気づきが「なし」でも送る", () => {
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 8 }), null);
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 7 }), "daily");
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 0 }), "daily");
  assert.equal(pickNotifyStage({ ...base, reminderDays: [], daysUntilExpiry: 3 }), "daily");
});

test("期限が過ぎたら送らない", () => {
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: -1 }), null);
  assert.equal(pickNotifyStage({ ...base, reminderDays: [30], daysUntilExpiry: -30 }), null);
});

test("同じ日に2通は送らない: 気づきの日が7日以内に入っても、直前の1通だけ", () => {
  // 選択肢は30日前より早いが、決まりとして、7日以内は直前の1通にまとめる
  assert.equal(pickNotifyStage({ ...base, reminderDays: [5], daysUntilExpiry: 5 }), "daily");
});

test("同じ日に2通は送らない: その日に送った印があれば、気づきも直前も送らない", () => {
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 60, notifiedOn: "2026-11-25" }), null);
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 3, notifiedOn: "2026-11-25" }), null);
  // 前の形の印(notifiedDailyOn)も見る
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 3, notifiedDailyOn: "2026-11-25" }), null);
  // 前の日の印なら、今日は送る
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 3, notifiedOn: "2026-11-24" }), "daily");
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 60, notifiedDailyOn: "2026-11-24" }), "reminder");
});

test("2回目(前の形の secondStageDays)は使わない", () => {
  // 前の形: 1回目90日前・2回目21日前 → 気づきは120日前だけ。21日前には送らない
  const selected = selectedReminderDays({ firstStageDays: 90, secondStageDays: 21 });
  const days = effectiveReminderDays(selected);
  assert.deepEqual(days, [120]);
  assert.equal(pickNotifyStage({ reminderDays: days, todayIso: "2026-11-25", daysUntilExpiry: 21 }), null);
  assert.equal(pickNotifyStage({ reminderDays: days, todayIso: "2026-11-25", daysUntilExpiry: 90 }), null);
  assert.equal(pickNotifyStage({ reminderDays: days, todayIso: "2026-11-25", daysUntilExpiry: 120 }), "reminder");
});

test("選んだ日は、全部効く(無料も有料も。依頼372)", () => {
  const days = effectiveReminderDays([120, 60, 30]);
  assert.equal(pickNotifyStage({ reminderDays: days, todayIso: "2026-11-25", daysUntilExpiry: 120 }), "reminder");
  assert.equal(pickNotifyStage({ reminderDays: days, todayIso: "2026-11-25", daysUntilExpiry: 60 }), "reminder");
  assert.equal(pickNotifyStage({ reminderDays: days, todayIso: "2026-11-25", daysUntilExpiry: 30 }), "reminder");
});

test("文(「そろそろ」は使わない)", () => {
  assert.equal(notifyBody("daily", "Tポイント", 3), "Tポイント、期限まであと3日です");
  assert.equal(notifyBody("daily", "Tポイント", 0), "Tポイント、期限は今日です");
  assert.equal(notifyBody("reminder", "Tポイント", 60), "Tポイント、期限まであと60日です");
  assert.ok(!notifyBody("reminder", "Tポイント", 60).includes("そろそろ"));
});
