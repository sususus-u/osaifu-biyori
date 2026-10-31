// 依頼366 仕事2: メニューの整理(3つのサービスで同じ形)。依頼372 で「アカウント」の欄をなくした。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { HUB_MENU_LINK_LABEL, HUB_MENU_URL } from "./login-handoff.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const menu = read("../app/menu/page.tsx");

test("並び: 「実績・データ」→「設定」→ いちばん下にホームへの小さな1行。「アカウント」「見る・調べる」は無い", () => {
  const data = menu.indexOf("<p style={SECTION_LABEL}>実績・データ</p>");
  const settings = menu.indexOf("<p style={SECTION_LABEL}>設定</p>");
  const link = menu.indexOf("href={HUB_MENU_URL}");
  assert.ok(data > 0 && data < settings && settings < link);
  assert.ok(!menu.includes("<p style={SECTION_LABEL}>アカウント</p>"));
  assert.ok(!menu.includes("見る・調べる"));
});

test("「実績・データ」に「実績」と「記録を書き出す（表の形）」(確かめの画面つき)", () => {
  const data = menu.slice(menu.indexOf("実績・データ"), menu.indexOf("<p style={SECTION_LABEL}>設定</p>"));
  assert.ok(data.includes('href="/reports"'));
  assert.ok(data.includes(">実績</span>"));
  assert.ok(data.includes("<RecordExport />"));
  const exp = read("../components/RecordExport.tsx");
  assert.ok(exp.includes("記録を書き出す（表の形）"));
  assert.ok(exp.includes("<ConfirmSheet"));
  // ほかの行と同じ形(押せる所は 44px 以上、字は 14px・太さ500)
  assert.ok(exp.includes("minHeight: 44,"));
  assert.ok(exp.includes('<span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>記録を書き出す（表の形）</span>'));
});

test("いちばん下の「おきづきびより（ホーム）へ」: ホームの「メニュー」を開く。小さな字、押せる高さは44px(依頼372)", () => {
  assert.equal(HUB_MENU_LINK_LABEL, "おきづきびより（ホーム）へ");
  assert.equal(HUB_MENU_URL, "https://okizukibiyori.com/account");
  const tail = menu.slice(menu.indexOf("href={HUB_MENU_URL}"));
  assert.ok(tail.includes("{HUB_MENU_LINK_LABEL}"));
  assert.ok(tail.includes("minHeight: 44,"));
  assert.ok(tail.includes("fontSize: 12,"));
  assert.ok(!menu.includes("AccountSettings"));
  assert.ok(!menu.includes("アカウント（ホーム）"));
  assert.equal(existsSync(new URL("../components/AccountSettings.tsx", import.meta.url)), false);
});
