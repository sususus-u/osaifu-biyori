import { test } from "node:test";
import assert from "node:assert/strict";
import { DAILY_NOTIFY_FROM_DAYS, DASHBOARD_OVERDUE_DAYS, notifyBody, pickNotifyStage } from "./notificationSchedule.ts";

const base = { firstStageDays: 90, secondStageDays: 21, expiryIso: "2026-12-01", todayIso: "2026-11-25" };

test("日数は7日", () => {
  assert.equal(DAILY_NOTIFY_FROM_DAYS, 7);
  assert.equal(DASHBOARD_OVERDUE_DAYS, 7);
});

test("1回目・2回目は、決めた日に1回ずつ(今までどおり)", () => {
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 90 }), "first");
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 21 }), "second");
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 21, notifiedSecondStageForDate: "2026-12-01" }), null);
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 30 }), null);
});

test("期限の7日前から当日までは、毎朝。同じ日に2回は送らない。過ぎたら送らない", () => {
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 8 }), null);
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 7 }), "daily");
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 0 }), "daily");
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 3, notifiedDailyOn: "2026-11-25" }), null);
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: 3, notifiedDailyOn: "2026-11-24" }), "daily");
  assert.equal(pickNotifyStage({ ...base, daysUntilExpiry: -1 }), null);
  // 2回目の日が7日以内でも、2回目として1回
  assert.equal(pickNotifyStage({ ...base, secondStageDays: 5, daysUntilExpiry: 5 }), "second");
});

test("文", () => {
  assert.equal(notifyBody("daily", "Tポイント", 3), "Tポイント、期限まであと3日です");
  assert.equal(notifyBody("daily", "Tポイント", 0), "Tポイント、期限は今日です");
  assert.equal(notifyBody("first", "Tポイント", 90), "Tポイント、そろそろ確認のタイミングです");
});
