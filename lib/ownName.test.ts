// 依頼366 仕事1: 呼び名は、おきづきびより(ホーム)の1か所だけ。このアプリは読むだけ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_NAME_TEXT, OWN_NAME_MAX, ownNameText, pickOwnName } from "./ownName.ts";

test("ホームの呼び名(username)を先に。前後の空白を除き、20文字まで", () => {
  assert.equal(pickOwnName({ username: "  すず  ", displayName: "古い名前" }), "すず");
  assert.equal(OWN_NAME_MAX, 20);
  assert.equal(pickOwnName({ username: "あ".repeat(25) }), "あ".repeat(20));
  // 絵文字などの2つ分の文字も、1文字と数える(途中で切らない)
  assert.equal(pickOwnName({ username: "😀".repeat(21) }), "😀".repeat(20));
});

test("ホームの呼び名が無ければ、古い表示名(displayName)を引き継ぐ", () => {
  assert.equal(pickOwnName({ displayName: " パパ " }), "パパ");
  assert.equal(pickOwnName({ username: "   ", displayName: "パパ" }), "パパ");
  assert.equal(pickOwnName({ username: 123, displayName: "パパ" }), "パパ");
});

test("どちらも無ければ null。画面には「（表示名なし）」", () => {
  assert.equal(pickOwnName(null), null);
  assert.equal(pickOwnName(undefined), null);
  assert.equal(pickOwnName({}), null);
  assert.equal(pickOwnName({ username: "", displayName: "  " }), null);
  assert.equal(NO_NAME_TEXT, "（表示名なし）");
  assert.equal(ownNameText({}), "（表示名なし）");
  assert.equal(ownNameText({ username: "すず" }), "すず");
});
