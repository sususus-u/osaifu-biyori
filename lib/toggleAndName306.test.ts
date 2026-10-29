import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("表示名の欄: ニックネームをすすめる案内と、ニックネームの例(依頼306。4つ共通)", () => {
  const src = read("../components/AccountSettings.tsx");
  assert.ok(src.includes("個人の情報を少なくするため、本名ではなく、ニックネームや家族の中での呼び名がおすすめです。"));
  assert.ok(src.includes('placeholder="例:すずちゃん、パパ"'));
});

test("開け閉めの印「+」「−」は 24px、押せる所は高さ44px以上(依頼306。4つ共通)", () => {
  const src = read("../components/AccountList.tsx");
  assert.match(src, /const TOGGLE_MARK_STYLE = \{[^}]*fontSize: 24/);
  assert.equal(src.split("style={TOGGLE_MARK_STYLE}").length - 1, 2);
  assert.equal(src.split("onClick={() => toggleMonth(key)}\n").length - 1, 2);
  assert.equal((src.match(/toggleMonth\(key\)\}\n\s*style=\{\{\n\s*minHeight: 44,/g) ?? []).length, 2);
});
