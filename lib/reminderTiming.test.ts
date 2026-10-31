import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DAILY_CAPTION,
  DAILY_LABEL,
  REMINDER_CAPTION,
  REMINDER_LABEL,
  REMINDER_FREE_MAX,
  REMINDER_PAID_MAX,
  REMINDER_SECTION_LABEL,
  earliestReminderDay,
  effectiveReminderDays,
  mapLegacyDays,
  reminderChipLabel,
  selectedReminderDays,
  toggleReminderDay,
} from "./reminderTiming.ts";

test("前の形の日数は、それ以上でいちばん小さい選択肢に。全部より大きいときは120", () => {
  assert.equal(mapLegacyDays(90), 120);
  assert.equal(mapLegacyDays(45), 60);
  for (const d of [21, 14, 10, 7]) assert.equal(mapLegacyDays(d), 30, String(d));
  assert.equal(mapLegacyDays(120), 120);
  assert.equal(mapLegacyDays(60), 60);
  assert.equal(mapLegacyDays(30), 30);
  assert.equal(mapLegacyDays(365), 120);
  assert.equal(mapLegacyDays(182), 120);
});

test("保存した値を読むときに置き換える(保存したデータは書き換えない)", () => {
  // 前の形: 1回目だけを置き換え、2回目は使わない
  assert.deepEqual(selectedReminderDays({ firstStageDays: 90, secondStageDays: 21 }), [120]);
  assert.deepEqual(selectedReminderDays({ firstStageDays: 365, secondStageDays: 182 }), [120]);
  assert.deepEqual(selectedReminderDays({ firstStageDays: 45, secondStageDays: 7 }), [60]);
  // 新しい形が優先(前の形の値があっても)
  assert.deepEqual(selectedReminderDays({ firstStageDays: 90, reminderDays: [30, 120] }), [120, 30]);
  // 空は「なし」
  assert.deepEqual(selectedReminderDays({ reminderDays: [] }), []);
  // 選択肢にない数・重なりは除く
  assert.deepEqual(selectedReminderDays({ reminderDays: [60, 60, 45, "x"] }), [60]);
  // 何もないときはデフォルト
  assert.deepEqual(selectedReminderDays(undefined), [60]);
  assert.deepEqual(selectedReminderDays({}), [60]);
  // 読んだあとも、渡したものは変えない
  const stored = { firstStageDays: 90, secondStageDays: 21 };
  selectedReminderDays(stored);
  assert.deepEqual(stored, { firstStageDays: 90, secondStageDays: 21 });
});

test("効く日: 選んだ日を全部(無料も有料も。依頼372)", () => {
  assert.equal(REMINDER_FREE_MAX, null);
  assert.equal(REMINDER_PAID_MAX, null);
  assert.deepEqual(effectiveReminderDays([30, 120, 60]), [120, 60, 30]);
  assert.deepEqual(effectiveReminderDays([]), []);
  assert.equal(earliestReminderDay([30, 60]), 60);
  assert.equal(earliestReminderDay([]), null);
});

test("選ぶ: 押すと付く、もう一度押すと外れる(無料も有料も同じ。依頼372)", () => {
  assert.deepEqual(toggleReminderDay([60], 30), [60, 30]);
  assert.deepEqual(toggleReminderDay([60, 30], 120), [120, 60, 30]);
  assert.deepEqual(toggleReminderDay([120, 30], 120), [30]);
  assert.deepEqual(toggleReminderDay([60], 60), []);
  assert.deepEqual(toggleReminderDay([], 30), [30]);
  // 選択肢にない数は、変えない
  assert.equal(toggleReminderDay([60], 45), null);
});

test("画面: 押せないボタンを作らない。有料の案内とプランの読み込みは、なくした(依頼372)", () => {
  const src = readFileSync(new URL("../components/AccountForm.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("showPaidGuide"));
  assert.ok(!src.includes("REMINDER_PAID_GUIDE"));
  assert.ok(!src.includes("有料のプラン"));
  assert.ok(!src.includes('authFetch("/api/plan")'));
  assert.ok(src.includes("shownDays.includes(day)"));
  assert.ok(src.includes("setReminderDays([]);"));
  const route = readFileSync(new URL("../app/api/send-notifications/route.ts", import.meta.url), "utf8");
  assert.ok(!route.includes("planForNotify"));
  assert.ok(route.includes(": effectiveReminderDays(selected),"));
});

test("画面の言葉(カタカナの言い方を使わない。「(デフォルト)」の印と「いちばん早い○日前だけ」の文は出さない。依頼353)", () => {
  assert.equal(REMINDER_SECTION_LABEL, "お知らせの時期");
  assert.equal(REMINDER_LABEL, "気づきのお知らせ");
  assert.equal(REMINDER_CAPTION, "選んだ日に1回ずつ");
  assert.equal(DAILY_LABEL, "直前のお知らせ");
  assert.equal(DAILY_CAPTION, "7日前から当日まで毎朝");
  assert.equal(reminderChipLabel(60), "60日前");
  assert.equal(reminderChipLabel(120), "120日前");
  const src = readFileSync(new URL("../components/AccountForm.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("通知タイミング"));
  assert.ok(!src.includes("デフォルト）"));
  assert.ok(!src.includes("freeOnlyEarliestNote"));
  assert.ok(!src.includes("アラート"));
  assert.ok(src.includes("{REMINDER_SECTION_LABEL}"));
  // 押せる所は44px以上、文字は12px以上
  assert.match(src, /minHeight: 44,\s+minWidth: 44,/);
});

test("登録・編集の画面: 自由な数の入力はない。気づきの日のためにプランは読まない(依頼372。GET /api/plan の窓口は残す)", () => {
  const src = readFileSync(new URL("../components/AccountForm.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("setFirstStageDays"));
  assert.ok(!src.includes("setSecondStageDays"));
  assert.ok(!src.includes('authFetch("/api/plan")'));
  assert.ok(!src.includes('useState<Plan>("free")'));
  const route = readFileSync(new URL("../app/api/plan/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes("verifyBearerIdToken"));
  assert.ok(route.includes("planFor(uid, idToken)"));
  assert.ok(route.includes('{ plan: "free" }'));
});
