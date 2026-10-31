import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("ニックネームをすすめる案内と例は、ホームの呼び名の欄にだけ(依頼366 仕事1。このアプリには入力の欄が無い)", () => {
  const src = read("../app/menu/page.tsx");
  assert.ok(!src.includes("ニックネーム"));
  assert.ok(!src.includes("例:すずちゃん、パパ"));
  // 前の中継(/api/user-name)は、画面からは呼ばない。窓口も消した(依頼371)
  assert.ok(!src.includes('authFetch("/api/user-name")'));
  assert.equal(existsSync(new URL("../app/api/user-name/route.ts", import.meta.url)), false);
});

test("開け閉めの印「+」「−」は 24px、押せる所は高さ44px以上(依頼306。4つ共通)", () => {
  const src = read("../components/AccountList.tsx");
  assert.match(src, /const TOGGLE_MARK_STYLE = \{[^}]*fontSize: 24/);
  assert.equal(src.split("style={TOGGLE_MARK_STYLE}").length - 1, 2);
  assert.equal(src.split("onClick={() => toggleMonth(key)}\n").length - 1, 2);
  assert.equal((src.match(/toggleMonth\(key\)\}\n\s*style=\{\{\n\s*minHeight: 44,/g) ?? []).length, 2);
});
