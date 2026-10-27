import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_AI_DAILY_BUDGET, ADMIN_AI_PAUSED, adminTokens, nextPushTimes } from "./adminPush.ts";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

test("初めてなら送り、今の時刻を記録する", () => {
  assert.deepEqual(nextPushTimes(undefined, 1000 * HOUR), [1000 * HOUR]);
});

test("10分に1回まで", () => {
  const now = 1000 * HOUR;
  assert.equal(nextPushTimes([now - 9 * MIN], now), null);
  assert.deepEqual(nextPushTimes([now - 10 * MIN], now), [now - 10 * MIN, now]);
});

test("1日に10回まで。1日より古い記録は捨てる", () => {
  const now = 1000 * HOUR;
  const ten = Array.from({ length: 10 }, (_, i) => now - (i + 1) * HOUR);
  assert.equal(nextPushTimes(ten, now), null);
  const old = [now - 25 * HOUR, ...ten.slice(0, 9)];
  assert.deepEqual(nextPushTimes(old, now), [...ten.slice(0, 9), now]);
});

test("壊れた記録は、ないものとして扱う", () => {
  assert.deepEqual(nextPushTimes(["x", null, NaN], 5), [5]);
  assert.deepEqual(nextPushTimes("broken", 5), [5]);
});

test("送り先のトークンは、文字列だけ", () => {
  assert.deepEqual(adminTokens({ fcmTokens: ["a", 1, "", "b"] }), ["a", "b"]);
  assert.deepEqual(adminTokens(undefined), []);
  assert.deepEqual(adminTokens({ fcmTokens: "a" }), []);
});

test("題は「おさいふびより(運営者向け):」で始まり、絵文字を使わない", () => {
  for (const t of [ADMIN_AI_PAUSED, ADMIN_AI_DAILY_BUDGET]) {
    assert.equal(t.title, "おさいふびより(運営者向け):AI の読み取りの停止");
    assert.ok(!/\p{Extended_Pictographic}/u.test(t.title + t.body));
    assert.ok(!/確認してください|今すぐ/.test(t.body));
  }
  assert.ok(ADMIN_AI_DAILY_BUDGET.body.includes("日本時間の0時に戻ります"));
});
