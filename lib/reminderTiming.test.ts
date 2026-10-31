import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DAILY_CAPTION,
  DAILY_LABEL,
  REMINDER_CAPTION,
  REMINDER_LABEL,
  REMINDER_PAID_GUIDE,
  REMINDER_SECTION_LABEL,
  earliestReminderDay,
  effectiveReminderDays,
  mapLegacyDays,
  reminderChipLabel,
  selectedReminderDays,
  shownReminderDays,
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

test("効く日: 無料はいちばん早い日だけ、有料(ゆったり・たっぷり)は全部", () => {
  assert.deepEqual(effectiveReminderDays([30, 120, 60], "free"), [120]);
  assert.deepEqual(effectiveReminderDays([30, 120, 60], "paid1"), [120, 60, 30]);
  assert.deepEqual(effectiveReminderDays([30, 120, 60], "paid2"), [120, 60, 30]);
  assert.deepEqual(effectiveReminderDays([], "free"), []);
  assert.equal(earliestReminderDay([30, 60]), 60);
  assert.equal(earliestReminderDay([]), null);
});

test("有料から無料に戻っても、保存した選択は残り、有料に戻れば全部効く", () => {
  const saved = [120, 60, 30];
  assert.deepEqual(effectiveReminderDays(saved, "free"), [120]);
  assert.deepEqual(saved, [120, 60, 30]);
  assert.deepEqual(effectiveReminderDays(saved, "paid1"), [120, 60, 30]);
});

test("選ぶ: 無料は押した日に切り替える(1つだけ)。有料は足す・外す(依頼348)", () => {
  assert.deepEqual(toggleReminderDay([60], 30, "free"), [30]);
  assert.deepEqual(toggleReminderDay([120], 60, "free"), [60]);
  assert.equal(toggleReminderDay([60], 60, "free"), null, "今の日を押しても、外さない(外すのは「なし」)");
  assert.deepEqual(toggleReminderDay([], 30, "free"), [30]);
  // 有料のときに選んだ日が残る無料の人: 効いているのは120日前。ほかを押すと、その日だけになる
  assert.deepEqual(shownReminderDays([120, 60, 30], "free"), [120]);
  assert.equal(toggleReminderDay([120, 60, 30], 120, "free"), null);
  assert.deepEqual(toggleReminderDay([120, 60, 30], 30, "free"), [30]);
  // 有料は、いくつでも(足す・外す)
  assert.deepEqual(shownReminderDays([120, 60, 30], "paid1"), [120, 60, 30]);
  assert.deepEqual(toggleReminderDay([60], 30, "paid1"), [60, 30]);
  assert.deepEqual(toggleReminderDay([60, 30], 120, "paid2"), [120, 60, 30]);
  assert.deepEqual(toggleReminderDay([120, 30], 120, "paid1"), [30]);
  // 選択肢にない数は、変えない
  assert.equal(toggleReminderDay([60], 45, "paid1"), null);
});

test("画面: 押せないボタンを作らない。無料の人には、案内を出したまま(依頼348)", () => {
  const src = readFileSync(new URL("../components/AccountForm.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("showPaidGuide"));
  assert.match(src, /\{plan === "free" && \(\s*<p style=\{\{ fontSize: 12[^>]*>\s*\{REMINDER_PAID_GUIDE\}/);
  assert.ok(src.includes("shownDays.includes(day)"));
});

test("画面の言葉(カタカナの言い方を使わない。デフォルトは「デフォルト」と出す)", () => {
  assert.equal(REMINDER_SECTION_LABEL, "お知らせの時期");
  assert.equal(REMINDER_LABEL, "気づきのお知らせ");
  assert.equal(REMINDER_CAPTION, "選んだ日に1回ずつ");
  assert.equal(DAILY_LABEL, "直前のお知らせ");
  assert.equal(DAILY_CAPTION, "7日前から当日まで毎朝");
  assert.equal(REMINDER_PAID_GUIDE, "有料のプランでは、いくつでも選べます。");
  assert.equal(reminderChipLabel(60), "60日前（デフォルト）");
  assert.equal(reminderChipLabel(120), "120日前");
  const src = readFileSync(new URL("../components/AccountForm.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("通知タイミング"));
  assert.ok(!src.includes("アラート"));
  assert.ok(src.includes("{REMINDER_SECTION_LABEL}"));
  // 押せる所は44px以上、文字は12px以上
  assert.match(src, /minHeight: 44,\s+minWidth: 44,/);
});

test("登録・編集の画面: 自由な数の入力はない。プランは GET /api/plan から(読めないときは無料)", () => {
  const src = readFileSync(new URL("../components/AccountForm.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("setFirstStageDays"));
  assert.ok(!src.includes("setSecondStageDays"));
  assert.ok(src.includes('authFetch("/api/plan")'));
  assert.ok(src.includes('useState<Plan>("free")'));
  const route = readFileSync(new URL("../app/api/plan/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes("verifyBearerIdToken"));
  assert.ok(route.includes("planFor(uid, idToken)"));
  assert.ok(route.includes('{ plan: "free" }'));
});
