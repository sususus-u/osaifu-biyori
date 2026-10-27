import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOADING_TEXT, listCountText } from "./listCount.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("一覧の見せ方の決まり(依頼236): 最後に「全○件」。しぼりこみ中は「全○件中 ○件」。ゼロ件は出さない", () => {
  assert.equal(listCountText(12), "全12件");
  assert.equal(listCountText(12, 3), "全12件中 3件");
  assert.equal(listCountText(0), null);
  assert.equal(LOADING_TEXT, "読み込み中…");
});

test("おさいふびよりの一覧: タブごとの件数(閉じている月も数える)、ゼロ件は点線の枠と登録のボタン", () => {
  const list = read("../components/AccountList.tsx");
  const has = (s: string) => assert.ok(list.includes(s), s);
  has("<ListCount total={withExpiry.length} />");
  has("<ListCount total={noExpiry.length} />");
  has("<ListCount total={accounts.length} />");
  has("<p>まだ期間限定のポイント・残高が登録されていません。</p>");
  has("<p>まだ期限なしのポイント・残高が登録されていません。</p>");
  has("<p>まだポイント・残高が登録されていません。</p>");
  // ゼロ件の登録ボタンは半角の「+」付き(依頼252・依頼253)
  assert.equal(list.split("+ ポイント・残高を登録する").length - 1, 4);
  has('<Link href="/accounts/new" className="btn-primary list-empty-btn">');
  assert.ok(!list.includes("登録されたサービスがありません"));
  // 「全○件」の下に、控えめなリンク(クイック更新)
  assert.ok(list.indexOf("<ListCount total={accounts.length} />") < list.indexOf('href="/accounts/quick-update"'));
  for (const f of ["../components/AccountList.tsx", "../components/AccountForm.tsx", "../components/QuickUpdate.tsx", "../app/reports/page.tsx"]) {
    assert.ok(!read(f).includes("読み込み中です..."), f);
  }
  const css = read("../app/globals.css");
  assert.match(css, /\.list-empty \{[^}]*border: 1px dashed/);
  assert.match(css, /\.list-count \{[^}]*text-align: center;[^}]*font-size: 12px;[^}]*color: #999;/);
});
