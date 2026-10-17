import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeToken, keyMatches } from "./accountDataAuth.ts";

test("トークンなし → no-token(今までどおり)", () => {
  assert.equal(judgeToken(null, null, "u1"), "no-token");
});
test("有効で uid 一致 → ok", () => {
  assert.equal(judgeToken("Bearer x", "u1", "u1"), "ok");
});
test("有効で uid 不一致 → forbidden", () => {
  assert.equal(judgeToken("Bearer x", "u2", "u1"), "forbidden");
});
test("無効(検証できない) → invalid", () => {
  assert.equal(judgeToken("Bearer x", null, "u1"), "invalid");
});
test("空のヘッダー → invalid", () => {
  assert.equal(judgeToken("", null, "u1"), "invalid");
});
test("Bearer の形が違う → invalid", () => {
  assert.equal(judgeToken("Basic abc", null, "u1"), "invalid");
  assert.equal(judgeToken("Bearer", null, "u1"), "invalid");
});
test("合言葉: 一致 / 不一致 / 長さ違い / 未設定 / ヘッダーなし", () => {
  assert.equal(keyMatches("secret", "secret"), true);
  assert.equal(keyMatches("secreT", "secret"), false);
  assert.equal(keyMatches("sec", "secret"), false);
  assert.equal(keyMatches("secret", undefined), false);
  assert.equal(keyMatches("secret", ""), false);
  assert.equal(keyMatches(null, "secret"), false);
});
