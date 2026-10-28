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

test("種類ごとの日数は、CATEGORY_DEFAULTS から出す", () => {
  const rules = notificationRules(vercel.crons);
  const miles = rules.notify.categories.find((c) => c.label === "マイル");
  assert.deepEqual(miles && [miles.firstDays, miles.secondDays], [365, 182]);
  assert.equal(rules.notify.categories.length, 7);
});
