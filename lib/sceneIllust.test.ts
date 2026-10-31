// 場面の絵の部品の写し(lib/scene-illust.jsx。正本はハブ。依頼366 仕事3・4)のテスト。
// 部品そのもののテストはハブにある。ここでは、写しを手で直していないことと、おさいふびよりでの使い方を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const versionOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

test("写しを手で直していない(頭の3行のあとが正本そのまま。版が頭の行と合う)", () => {
  // 改行は LF で比べる(ハブの道具と同じ。端末の設定で CRLF になっていても同じと見る)
  const lines = read("./scene-illust.jsx").replace(/\r\n/g, "\n").split("\n");
  assert.equal(lines[0], "// 写し(手で書き換えない)。正本: ハブ(okizukibiyori-hub)の src/lib/scene-illust.jsx");
  const m = /^\/\/ 正本の版: ([0-9a-f]{16}) \/ 写しの中身の版: ([0-9a-f]{16})$/.exec(lines[1]);
  assert.ok(m, "写しの頭に、版の行がない");
  assert.equal(m[1], m[2]);
  assert.equal(lines[2], "// 正本を直したら、ハブで node scripts/scene-illust-copy.mjs を実行して写し直す(依頼366 仕事4)。");
  assert.equal(versionOf(lines.slice(3).join("\n")), m[2], "写しが正本と違う。ハブで node scripts/scene-illust-copy.mjs を実行して写し直す");
});

test("おさいふびよりの色(線は #6e2a32、点は金)。赤は使っていない", () => {
  const src = read("./scene-illust.jsx");
  assert.ok(src.includes('osaifu: { line: "#6e2a32", accent: "#ad8a4c", surface: "#ffffff" },'));
  assert.ok(!/#(b3261e|ff0000|e53935|d32f2f|c62828)/i.test(src));
  // 動きを減らす設定では止まる
  assert.ok(src.includes("@media (prefers-reduced-motion: reduce)"));
});
