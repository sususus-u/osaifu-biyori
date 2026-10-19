import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTargetSize, readScanJson, SCAN_TOO_LARGE_MESSAGE } from "./scanImage.ts";

test("長辺が1600以下なら、そのまま(拡大しない)", () => {
  assert.deepEqual(computeTargetSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(computeTargetSize(1600, 1200), { width: 1600, height: 1200 });
});
test("横長を、長辺1600に縮める(縦横比を保つ)", () => {
  assert.deepEqual(computeTargetSize(4000, 3000), { width: 1600, height: 1200 });
});
test("縦長を、長辺1600に縮める", () => {
  assert.deepEqual(computeTargetSize(3024, 4032), { width: 1200, height: 1600 });
});
test("極端な細長でも、0にならない", () => {
  assert.deepEqual(computeTargetSize(10000, 1), { width: 1600, height: 1 });
});

test("413(本文が JSON でない) → 撮り直しの文言", async () => {
  const res = new Response("Request Entity Too Large\n FUNCTION_PAYLOAD_TOO_LARGE", { status: 413 });
  await assert.rejects(readScanJson(res), { message: SCAN_TOO_LARGE_MESSAGE });
});
test("JSONでない応答(500のHTML、200のテキスト)でも、生の例外を出さない", async () => {
  await assert.rejects(readScanJson(new Response("<html>error</html>", { status: 500 })), {
    message: "読み取りに失敗しました",
  });
  await assert.rejects(readScanJson(new Response("Rate limit", { status: 200 })), {
    message: "読み取りに失敗しました",
  });
});
test("サーバーの案内文(上限到達など)は、そのまま使う", async () => {
  const res = Response.json({ error: "本日の上限です", code: "daily_limit" }, { status: 429 });
  await assert.rejects(readScanJson(res), { message: "本日の上限です" });
});
test("正常な JSON は、そのまま返す", async () => {
  const data = await readScanJson<{ name: string }>(Response.json({ name: "切手" }));
  assert.equal(data.name, "切手");
});
