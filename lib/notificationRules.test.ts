import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jstHourFromCron, notificationRules } from "./notificationRules.ts";

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("送る時刻は、vercel.json の時刻を日本時間に直したもの(今は9時)", () => {
  assert.equal(jstHourFromCron("0 0 * * *"), 9);
  assert.equal(jstHourFromCron("30 20 * * *"), 5);
  assert.equal(jstHourFromCron("*/5 * * * *"), null);
  assert.equal(notificationRules(vercel.crons).notifyHourJst, 9);
});

test("種類ごとの日数は、どれもデフォルトの60日前。secondDays は数(0)のまま残す(依頼317)", () => {
  const rules = notificationRules(vercel.crons);
  assert.equal(rules.notify.categories.length, 7);
  for (const c of rules.notify.categories) {
    assert.equal(typeof c.label, "string");
    assert.equal(c.firstDays, 60);
    assert.equal(typeof c.secondDays, "number");
    assert.equal(c.secondDays, 0);
  }
  const miles = rules.notify.categories.find((c) => c.label === "マイル");
  assert.deepEqual(miles && [miles.firstDays, miles.secondDays], [60, 0]);
});

test("今までの欄は、同じ型のまま(今のホームが読む)", () => {
  const rules = notificationRules(vercel.crons);
  assert.equal(rules.notify.dailyFromDays, 7);
  assert.equal(rules.dashboard.overdueDays, 7);
  assert.equal(rules.dashboard.maxItems, 3);
});

test("notify.reminder を足した(選べる日数、デフォルト、なし、無料と有料の数)", () => {
  const rules = notificationRules(vercel.crons);
  assert.deepEqual(rules.notify.reminder, {
    choices: [120, 60, 30],
    defaultDays: 60,
    allowNone: true,
    freeMax: 1,
    paidMax: null,
  });
  // JSON にしても、paidMax は null のまま残る
  assert.match(JSON.stringify(rules), /"paidMax":null/);
});
