// 依頼366 仕事2: メニューの整理(3つのサービスで同じ形)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const menu = read("../app/menu/page.tsx");
const row = read("../components/AccountSettings.tsx");

test("並び: 「実績・データ」→「アカウント」→「設定」。「見る・調べる」は無くなった", () => {
  const data = menu.indexOf("<p style={SECTION_LABEL}>実績・データ</p>");
  const account = menu.indexOf("<p style={SECTION_LABEL}>アカウント</p>");
  const settings = menu.indexOf("<p style={SECTION_LABEL}>設定</p>");
  assert.ok(data > 0 && data < account && account < settings);
  assert.ok(!menu.includes("見る・調べる"));
});

test("「実績・データ」に「実績」と「記録を書き出す（表の形）」(確かめの画面つき)", () => {
  const data = menu.slice(menu.indexOf("実績・データ"), menu.indexOf("<p style={SECTION_LABEL}>アカウント</p>"));
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

test("「アカウント」は「おきづきびよりのアカウント」の1行だけ。「アカウント（ホーム）」の行は無くした", () => {
  const account = menu.slice(menu.indexOf("<p style={SECTION_LABEL}>アカウント</p>"), menu.indexOf("<p style={SECTION_LABEL}>設定</p>"));
  assert.ok(account.includes("<AccountSettings />"));
  assert.ok(!account.includes("<a"));
  assert.ok(!account.includes("<RecordExport"));
  assert.ok(!menu.includes("HUB_ACCOUNT_URL"));
  assert.ok(!menu.includes("アカウント（ホーム）"));
  // 行は1つ(つなぎ先は HUB_ACCOUNT_URL)。呼び名は読むだけで、行の中に小さく添える
  assert.equal(row.split("<a").length - 1, 1);
  assert.ok(row.includes("href={HUB_ACCOUNT_URL}"));
  assert.ok(row.includes("{HUB_ACCOUNT_MENU_LABEL}"));
  assert.ok(row.includes("{HUB_NAME_LINK_TEXT}"));
  assert.ok(row.includes("minHeight: 44,"));
  assert.ok(!row.includes("<input"));
  // 補いの字は 12px 以上・補足の色
  assert.ok(row.includes('const CAPTION = { fontSize: 12, color: "var(--text-muted)"'));
});

test("「おきづきびよりのアカウント」の下に、小さく「呼び名:○○」(依頼371 の決定2。3つのサービスで同じ形。「:」は半角で、空白なし)", () => {
  assert.ok(row.includes("呼び名:{name}"));
  assert.equal(row.includes("呼び名: {"), false);
});
