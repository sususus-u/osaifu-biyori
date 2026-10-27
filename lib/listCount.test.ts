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

test("主な一覧以外の一覧(依頼268): クイック更新の一覧は白い枠・「全○件」・ゼロ件の点線の枠と登録のボタン", () => {
  const qu = read("../components/QuickUpdate.tsx");
  const has = (s: string) => assert.ok(qu.includes(s), s);
  // 白い枠(角16px、細い線)。以前の Tailwind の枠(角6px)はやめた
  has('<ul className="card" style={{ padding: 0, overflow: "hidden", margin: 0, listStyle: "none" }}>');
  assert.ok(!qu.includes('className="divide-y border rounded-md"'));
  // 枠の外の、すぐ下に「全○件」(1行=1つのまとまり)
  has('<p className="list-count">{listCountText(groupKeys.length)}</p>');
  assert.ok(qu.indexOf("</ul>") < qu.indexOf("{listCountText(groupKeys.length)}"));
  // ゼロ件: 点線の枠、「まだ○○が登録されていません。」、半角の「+」付きの登録のボタン
  has('<div className="list-empty">');
  has("<p>まだ継続型のポイント・残高が登録されていません。</p>");
  has('<Link href="/accounts/new" className="btn-primary list-empty-btn">');
  has("+ ポイント・残高を登録する");
  assert.ok(!qu.includes("＋"));
  // 読み込みが済むまでは「読み込み中…」(ゼロ件の枠を先に出さない)
  assert.ok(qu.indexOf("{!loaded ? (") < qu.indexOf('<div className="list-empty">'));
  has("setLoaded(true);");
});

test("主な一覧以外の一覧(依頼268): 実績の画面の待ちの文も「読み込み中…」", () => {
  const rep = read("../app/reports/page.tsx");
  assert.ok(!rep.includes("集計しています"));
  assert.ok(rep.includes("{isFetching && <p style={{ fontSize: 13, color: \"#999\" }}>{LOADING_TEXT}</p>}"));
});

test("お知らせの一覧(依頼270): 1件ずつの枠のまま、最後に「全○件」。ゼロ件は3つとも「お知らせは、まだありません。」", () => {
  const ann = read("./announcements.ts");
  assert.ok(ann.includes('export const ANNOUNCEMENT_EMPTY_TEXT = "お知らせは、まだありません。";'));
  const top = read("../app/notifications/page.tsx");
  const all = read("../app/notifications/all/page.tsx");
  for (const [name, src] of [["notifications", top], ["all", all]] as const) {
    assert.ok(!src.includes("運営からのお知らせは、まだありません"), name);
    assert.ok(!src.includes('className="empty-state"'), name);
    assert.ok(src.includes('<div className="list-empty">'), name);
  }
  // あなたへのお知らせ・運営からのお知らせ(登録済みがゼロ)の2か所
  assert.equal(top.split("{ANNOUNCEMENT_EMPTY_TEXT}").length - 1, 1);
  assert.ok(top.includes("? ANNOUNCEMENT_EMPTY_TEXT"));
  assert.ok(all.includes("<p>{ANNOUNCEMENT_EMPTY_TEXT}</p>"));
  // 「全○件」は、最後のお知らせのすぐ下(過去のお知らせへのリンクより上)
  assert.ok(top.includes('<p className="list-count">{listCountText(visible.length)}</p>'));
  assert.ok(top.indexOf("{listCountText(visible.length)}") < top.lastIndexOf("<PastAnnouncementsLink />"));
  assert.ok(top.indexOf("{visible.map(") < top.indexOf("{listCountText(visible.length)}"));
  assert.ok(all.indexOf("{announcements.map(") < all.indexOf("{listCountText(announcements.length)}"));
});

test("実績の残高の表(依頼270): 見出しは枠の上の端の帯、ゼロ件は点線の枠(登録のボタンなし)、「全○件」は付けない", () => {
  const rep = read("../app/reports/page.tsx");
  const has = (s: string) => assert.ok(rep.includes(s), s);
  has('<p className="list-band">{title}</p>');
  has('<div className="list-empty with-band" style={style}>');
  has('emptyText="まだ期間限定の継続型のポイント・残高が登録されていません。"');
  has('emptyText="まだ期限なしの継続型のポイント・残高が登録されていません。"');
  assert.ok(!rep.includes("対象のポイント・残高がありません"));
  assert.ok(!rep.includes("listCountText"));
  assert.ok(!rep.includes("list-empty-btn"));
  // 帯は、主な一覧の月の見出しと同じ色・余白
  const css = read("../app/globals.css");
  assert.match(css, /\.list-band \{[^}]*padding: 10px 14px;[^}]*font-size: 13px;[^}]*font-weight: 500;[^}]*background: #faf8f6;/);
});

test("ゼロ件の点線の枠(依頼270): 文とボタンを、枠の中の上下・左右の真ん中に", () => {
  const css = read("../app/globals.css");
  assert.match(css, /\.list-empty \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*align-items: center;[^}]*justify-content: center;[^}]*min-height: 140px;[^}]*text-align: center;/);
  assert.match(css, /\.list-empty-body \{[^}]*align-items: center;[^}]*justify-content: center;/);
  assert.match(css, /\.list-empty p:last-child \{[^}]*margin-bottom: 0;/);
});

test("一覧の枠の線(依頼270): 白い地と見出しの帯に対して、コントラスト 3:1 以上", () => {
  const css = read("../app/globals.css");
  const m = css.match(/--list-frame-border: (#[0-9a-f]{6});/);
  assert.ok(m);
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // 画面の地(.app-shell)と枠の中は #fff、見出しの帯は #faf8f6
  for (const bg of ["#ffffff", "#faf8f6"]) assert.ok(ratio(m[1], bg) >= 3, bg);
  assert.match(css, /\.card \{[^}]*border: 1px solid var\(--list-frame-border\);/);
  assert.match(css, /\.notif-card \{[^}]*border: 1px solid var\(--list-frame-border\);/);
  assert.match(css, /\.list-empty \{[^}]*border: 1px dashed var\(--list-frame-border\);/);
});

test("お知らせを全部非表示にしたとき(依頼271): 「表示中のお知らせは、ありません。」。登録済みがゼロのときは「お知らせは、まだありません。」のまま", () => {
  const top = read("../app/notifications/page.tsx");
  assert.ok(top.includes(': "表示中のお知らせは、ありません。"}'));
  assert.ok(!top.includes('"表示中のお知らせは、ありません"'));
  assert.ok(top.includes("? ANNOUNCEMENT_EMPTY_TEXT"));
});

test("一覧ではない白い枠(依頼271): 一覧の枠と同じ線。区切りの線と入力の欄は変えない", () => {
  const css = read("../app/globals.css");
  assert.match(css, /\.settings-card \{[^}]*border: 1px solid var\(--list-frame-border\);/);
  assert.ok(!/\.settings-card \{[^}]*border: 0\.5px solid #eee/.test(css));
  // 入力の欄はそのまま
  assert.match(css, /\.field input,\s*\.field select \{[^}]*border: 1px solid #ddd;/);
  const scan = read("../components/ScanUpload.tsx");
  assert.ok(scan.includes('className="border rounded-md p-4 space-y-3" style={{ borderColor: "var(--list-frame-border)" }}'));
  // このサービスには暗い表示が無い
  assert.ok(!css.includes("prefers-color-scheme"));
});

test("選択のバーの端の線と、白い地のボタンの線(依頼272): 一覧の枠と同じ線(3:1 以上)。入力の欄と区切りの線は変えない", () => {
  const list = read("../components/AccountList.tsx");
  assert.ok(!list.includes("#d9cfcf"));
  assert.ok(list.includes('borderBottom: "1px solid var(--list-frame-border)",'));
  assert.ok(list.includes('borderTop: "1px solid var(--list-frame-border)",'));
  // 並べ替えのボタン(選んでいないもの)
  assert.equal(list.match(/\? "none" : "1px solid var\(--list-frame-border\)"/g)?.length, 3);
  assert.ok(!list.includes('"1px solid #ddd"'));
  const css = read("../app/globals.css");
  assert.match(css, /\.confirm-btn-cancel \{[^}]*border: 1px solid var\(--list-frame-border\);/);
  assert.match(css, /\.announcement-dismiss-btn \{[^}]*border: 1px solid var\(--list-frame-border\);/);
  const form = read("../components/AccountForm.tsx");
  assert.equal(form.match(/border: "1px solid var\(--list-frame-border\)",\s*borderRadius: "var\(--radius-pill\)",\s*background: "#fef8f5"/g)?.length, 2);
  assert.ok(read("../components/NotificationSetup.tsx").includes("border border-[var(--list-frame-border)]"));
  // 入力の欄と区切りの線は、そのまま
  assert.match(css, /\.field input,\s*\.field select \{[^}]*border: 1px solid #ddd;/);
  assert.ok(read("../components/AccountSettings.tsx").includes('border: "1px solid #ddd",'));
  assert.ok(read("../components/AccountRow.tsx").includes('borderTop: "0.5px solid #f0f0f0",'));
  // コントラスト: 画面の地・バー・ボタンの中(#fff)、見出しの帯(#faf8f6)、読み取りのボタンの中(#fef8f5)
  const m = css.match(/--list-frame-border: (#[0-9a-f]{6});/);
  assert.ok(m);
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const bg of ["#ffffff", "#faf8f6", "#fef8f5"]) assert.ok(ratio(m[1], bg) >= 3, bg);
});
