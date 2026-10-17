// 実行: npm test(Node 標準のテスト機能。追加の部品は不要)
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAuthToken, stripAuthToken, MAX_AUTH_TOKEN_LENGTH } from "./authToken.ts";

const B = "https://app.example/p";

test("クエリだけ: 使わず、URL から取り除く", () => {
  const r = extractAuthToken(`${B}?authToken=abc`);
  assert.equal(r.token, null);
  assert.equal(r.rejected, false);
  assert.equal(r.cleanedPath, "/p");
});
test("フラグメントだけ", () => {
  const r = extractAuthToken(`${B}#authToken=abc`);
  assert.equal(r.token, "abc");
  assert.equal(r.cleanedPath, "/p");
});
test("両方あるときは # の後ろだけを使い、両方消す", () => {
  const r = extractAuthToken(`${B}?authToken=q#authToken=f`);
  assert.equal(r.token, "f");
  assert.equal(r.cleanedPath, "/p");
});
test("どちらもなし(何も変えない)", () => {
  const r = extractAuthToken(`${B}?a=1#x`);
  assert.equal(r.token, null);
  assert.equal(r.rejected, false);
  assert.equal(r.cleanedPath, "/p?a=1#x");
});
test("join と invite は残す", () => {
  const r = extractAuthToken(`${B}?join=g1&invite=i1&authToken=t#authToken=t`);
  assert.equal(r.cleanedPath, "/p?join=g1&invite=i1");
});
test("別のフラグメントは残す", () => {
  assert.equal(extractAuthToken(`${B}#sec`).cleanedPath, "/p#sec");
  assert.equal(extractAuthToken(`${B}#sec&authToken=t`).cleanedPath, "/p#sec");
  assert.equal(extractAuthToken(`${B}#authToken=t&sec`).cleanedPath, "/p#sec");
  assert.equal(extractAuthToken(`${B}?return=%2Fa#authToken=t`).cleanedPath, "/p?return=%2Fa");
});
test("# の値が空なら、? の値があっても引き継ぎなし。URL からは消す", () => {
  const r = extractAuthToken(`${B}?authToken=q#authToken=`);
  assert.equal(r.token, null);
  assert.equal(r.rejected, false);
  assert.equal(r.cleanedPath, "/p");
});
test("長すぎる # の値は拒否する。? の値は読まないので拒否もしない", () => {
  const long = "a".repeat(MAX_AUTH_TOKEN_LENGTH + 1);
  const r = extractAuthToken(`${B}#authToken=${long}`);
  assert.equal(r.token, null);
  assert.equal(r.rejected, true);
  assert.equal(r.cleanedPath, "/p");
  const q = extractAuthToken(`${B}?authToken=${long}`);
  assert.equal(q.token, null);
  assert.equal(q.rejected, false);
  assert.equal(q.cleanedPath, "/p");
  assert.equal(extractAuthToken(`${B}#authToken=${"a".repeat(MAX_AUTH_TOKEN_LENGTH)}`).rejected, false);
});
test("# の state を読み、URL から取り除く。? の state は読まない", () => {
  const r = extractAuthToken(`${B}?state=q#authToken=t&state=s1&sec`);
  assert.equal(r.token, "t");
  assert.equal(r.state, "s1");
  assert.equal(r.cleanedPath, "/p?state=q#sec");
  assert.equal(extractAuthToken(`${B}#authToken=t`).state, null);
});
test("stripAuthToken は戻り先 URL から両方外す", () => {
  assert.equal(stripAuthToken(`${B}?join=g&authToken=t#authToken=t`), `${B}?join=g`);
});
