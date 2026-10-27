// 言葉の決まり(依頼252。正本はハブの BRAND.md 3章「言葉の決まり」)を、画面の文で確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UNDO_FAILED_MESSAGE } from "./savedNotice.ts";
import { DELETE_FAILED_MESSAGE } from "./deleteAccount.ts";
import { SCAN_FAILED_MESSAGE } from "./scanImage.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const SCREENS = [
  "../app/notifications/page.tsx",
  "../app/notifications/all/page.tsx",
  "../app/reports/page.tsx",
  "../app/menu/page.tsx",
  "../components/AccountForm.tsx",
  "../components/AccountList.tsx",
  "../components/AccountSettings.tsx",
  "../components/AppShell.tsx",
  "../components/LoginGuide.tsx",
  "../components/LogoutButton.tsx",
  "../components/NotificationSetup.tsx",
  "../components/QuickUpdate.tsx",
  "../components/ScanPhysicalUpload.tsx",
  "../components/ScanUpload.tsx",
];

test("待ちの文は全角の「…」で終える。日本語の文の疑問の印は全角の「？」", () => {
  for (const f of SCREENS) {
    const src = read(f);
    assert.ok(!/[ぁ-んァ-ヶ一-龠]\.\.\."/.test(src), f + ": 「...」");
    assert.ok(!/(ますか|ですか)\?/.test(src), f + ": 半角の ?");
  }
});

test("失敗のあとの案内は「もう一度お試しください。」。元に戻す・AI の読み取りの失敗の文", () => {
  assert.equal(UNDO_FAILED_MESSAGE, "元に戻せませんでした。もう一度お試しください。");
  assert.equal(DELETE_FAILED_MESSAGE, "削除に失敗しました。もう一度お試しください。");
  assert.equal(SCAN_FAILED_MESSAGE, "読み取りに失敗しました。もう一度お試しいただくか、手入力で登録してください。");
  for (const f of [...SCREENS, "./usageLimit.ts"]) {
    const src = read(f);
    assert.ok(!src.includes("再度お試し"), f);
    assert.ok(!src.includes("もう一度、お試し"), f);
  }
});

test("1件1件は「ポイント・残高」(「項目」とは呼ばない。依頼253)。タブは「発行元別」。画面の題", () => {
  const shell = read("../components/AppShell.tsx");
  assert.ok(shell.includes('"/": "おさいふの中身"'));
  assert.ok(shell.includes('"/accounts/new": "ポイント・残高を登録"'));
  assert.ok(shell.includes('return "ポイント・残高を編集"'));
  assert.ok(read("../components/AccountList.tsx").includes('label: "発行元別"'));
  const form = read("../components/AccountForm.tsx");
  assert.ok(form.includes("このポイント・残高を削除する"));
  assert.ok(form.includes('isEditMode ? "更新する" : "登録する"'));
  assert.ok(!form.includes("このサービス"));
  // 画面に出る文に「項目」を使わない(コメントは除く)
  const uiOnly = (src: string) => src.replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  for (const f of SCREENS) assert.ok(!uiOnly(read(f)).includes("項目"), f + ": 「項目」");
  assert.ok(!uiOnly(read("./hubRecordCheck.ts")).includes("項目"));
  assert.ok(!uiOnly(read("./stampMerge.ts")).includes("項目"));
});

test("「+」は半角(全角の「＋」は使わない。依頼253)", () => {
  for (const f of SCREENS) assert.ok(!read(f).includes("＋"), f);
});

test("開閉の印は「−」(U+2212)と半角の「+」(全角の「－」は使わない。依頼256)", () => {
  for (const f of SCREENS) assert.ok(!read(f).includes("－"), f);
  const reports = read("../app/reports/page.tsx");
  assert.ok(reports.includes('showUsedUpList ? "− 閉じる" : "+ 内訳を見る"'));
  assert.ok(reports.includes('showExpiredList ? "− 閉じる" : "+ 内訳を見る"'));
  const list = read("../components/AccountList.tsx");
  assert.equal(list.split('expanded ? "−" : "+"').length - 1, 2);
});

test("1人ごとの1日の AI の回数の上限の文(依頼253)", () => {
  assert.ok(
    read("./usageLimit.ts").includes(
      '"今日の AI の読み取りは、上限の回数に届きました。明日また使えます。手入力で登録できます。"',
    ),
  );
});

test("削除のボタンは、どこでも .btn-danger の形(依頼253)", () => {
  const css = read("../app/globals.css");
  assert.match(css, /\.btn-danger \{[^}]*background: #fff;[^}]*color: #b3261e;[^}]*border: 1px solid #b3261e;[^}]*border-radius: var\(--radius-pill\);/);
  assert.ok(read("../components/AccountForm.tsx").includes('className="btn-danger form-btn form-btn-danger-gap"'));
  assert.ok(read("../components/AccountList.tsx").includes('className="btn-danger btn-danger-compact"'));
  assert.ok(read("../components/ScanPhysicalUpload.tsx").includes('className="btn-danger btn-danger-small"'));
});

test("現物の読み取り: 作ったら「登録しました」、足した・置き換えたら「更新しました」(「保存しました」は設定だけ)", () => {
  const src = read("../components/ScanPhysicalUpload.tsx");
  assert.ok(src.includes('`「${name}」を${matchedAccountId ? "更新しました" : "登録しました"}`'));
  assert.ok(!src.includes("保存しました"));
});

test("お知らせは一覧から隠すだけなので「非表示にする」と書く(依頼253)", () => {
  const src = read("../app/notifications/page.tsx");
  assert.ok(src.includes("選んだお知らせを非表示にする"));
  assert.ok(src.includes('"件のお知らせを非表示にしますか？"'));
  assert.ok(src.includes('"件を非表示にする"'));
  assert.ok(src.includes('"件のお知らせを非表示にしました"'));
  assert.ok(!src.replace(/\/\/.*$/gm, "").includes("削除"));
  assert.ok(!src.includes("消しますか"));
});

test("利用者向けの通知の題は「おさいふびより:何の知らせか」", () => {
  assert.ok(read("../app/api/send-notifications/route.ts").includes('title: "おさいふびより:期限のお知らせ"'));
  assert.ok(read("./messaging.ts").includes('|| "おさいふびより:お知らせ"'));
  assert.ok(read("../scripts/firebase-messaging-sw.template.js").includes('|| "おさいふびより:お知らせ"'));
});

test("編集の画面のボタン: 更新する、ほかの操作、少し空けて削除。横いっぱい、同じ高さ(依頼257)", () => {
  const css = read("../app/globals.css");
  // 4つの形に同じ修飾を足し、高さ・余白・文字をそろえる
  assert.match(
    css,
    /\.btn-primary\.form-btn,\s*\.btn-outline\.form-btn,\s*\.btn-outline-warm\.form-btn,\s*\.btn-danger\.form-btn \{[^}]*width: 100%;[^}]*box-sizing: border-box;[^}]*min-height: 48px;[^}]*padding: 12px 16px;[^}]*font-size: 15px;[^}]*font-weight: 500;/,
  );
  assert.match(css, /\.form-btn-stack \{[^}]*flex-direction: column;[^}]*gap: 10px;[^}]*margin-top: 10px;/);
  assert.match(css, /\.form-btn-danger-gap \{[^}]*margin-top: 24px;/);
  // ほかの場所の .btn-primary の形は変えていない
  assert.match(css, /\.btn-primary \{[^}]*padding: 13px;/);

  const form = read("../components/AccountForm.tsx");
  const primary = form.indexOf('{isSubmitting ? (isEditMode ? "更新中…"');
  const stack = form.indexOf('<div className="form-btn-stack">');
  const usedUp = form.indexOf('className="btn-outline form-btn"');
  const expired = form.indexOf('className="btn-outline-warm form-btn"');
  const del = form.indexOf('className="btn-danger form-btn form-btn-danger-gap"');
  assert.ok(primary > 0 && primary < stack && stack < usedUp && usedUp < expired && expired < del, "並びの順");
  assert.ok(!form.includes('className="action-row"'), "2列の並びはやめた");

  // ほかの編集の画面も同じ形
  assert.ok(read("../components/QuickUpdate.tsx").includes('className="btn-primary form-btn"'));
  const scan = read("../components/ScanUpload.tsx");
  assert.ok(scan.includes('className="btn-primary form-btn"'));
  assert.equal(scan.split('className="btn-outline form-btn"').length - 1, 2);
});

test("待ちの文: 直すときは「更新中…」、新しく作るときは「登録中…」。「保存中…」は設定だけ(依頼257)", () => {
  const form = read("../components/AccountForm.tsx");
  assert.ok(form.includes('{isSubmitting ? (isEditMode ? "更新中…" : "登録中…") : isEditMode ? "更新する" : "登録する"}'));
  assert.ok(form.includes('submitAction === "replace" ? "更新中…" : "置き換える"'));
  assert.ok(form.includes('submitAction === "add" ? "更新中…" : "今回の分を追加する"'));
  assert.ok(form.includes('submitAction === "submit" ? "登録中…" : "新たに登録する"'));
  const physical = read("../components/ScanPhysicalUpload.tsx");
  assert.ok(physical.includes('{isSaving ? "更新中…" : "置き換える"}'));
  assert.ok(physical.includes('{isSaving ? "更新中…" : "今回の分を追加する"}'));
  assert.ok(physical.includes('{isSaving ? "登録中…" : stampMode'));
  for (const f of SCREENS) {
    if (f.endsWith("AccountSettings.tsx")) continue;
    assert.ok(!read(f).includes("保存中…"), f + ": 「保存中…」");
  }
  assert.ok(read("../components/AccountSettings.tsx").includes('"保存中…" : "保存"'));
});

test("お知らせの非表示は削除ではないので、赤ではなくサービスの色(依頼257)", () => {
  const src = read("../app/notifications/page.tsx");
  assert.ok(!src.includes('variant="danger"'));
  assert.ok(src.includes('variant="normal"'));
  assert.match(read("../app/globals.css"), /\.announcement-dismiss-btn \{[^}]*color: var\(--brand\);/);
});

test("件数のかっこは全角の「（」「）」(依頼257)", () => {
  assert.ok(read("../app/notifications/page.tsx").includes("選んだお知らせを非表示にする{selectedCount > 0 ? `（${selectedCount}件）` : \"\"}"));
  assert.ok(read("../components/AccountForm.tsx").includes("（枚数:{duplicateAccount.itemQuantity}枚）"));
  for (const f of SCREENS) {
    const src = read(f)
      .replace(/\/\/.*$/gm, "")
      .replace(/aria-label="[^"]*"/g, "");
    assert.ok(!/\([^()\n]{0,40}(件|枚)\)/.test(src), f + ": 半角のかっこの件数");
  }
});

test("「使いきった」は使い切りの種類(完結型)だけ。「失効した」はどちらにも(依頼259。依頼234 の決まりどおり)", () => {
  const form = read("../components/AccountForm.tsx");
  const usedUp = form.indexOf('onClick={() => setPendingOutcome("used_up")}');
  const finiteGuard = form.lastIndexOf('{accountType === "finite" && (', usedUp);
  const stack = form.indexOf('<div className="form-btn-stack">');
  assert.ok(stack < finiteGuard && finiteGuard < usedUp, "「使いきった」は完結型だけ");
  const expired = form.indexOf('onClick={() => setPendingOutcome("expired")}');
  assert.ok(form.slice(usedUp, expired).includes("使いきった\n              </button>\n            )}"), "「失効した」は条件の外");
});

test("確認の赤は、元に戻せない操作だけ。残高が続く種類の「失効した」はサービスの色(依頼259)", () => {
  const form = read("../components/AccountForm.tsx");
  assert.ok(form.includes('variant={accountType === "finite" ? "danger" : "normal"}'), "使いきった・失効した");
  assert.ok(!form.includes('variant={pendingOutcome === "expired" ? "danger" : "normal"}'));
  // 削除と「置き換える」は、元に戻せないので赤のまま
  assert.equal(form.split('variant="danger"').length - 1, 2);
  assert.ok(read("../components/ScanPhysicalUpload.tsx").includes('confirmLabel="置き換える"\n          busyLabel="置き換え中…"\n          variant="danger"'));
});

test("日本語の文の中のかっこは全角の「（」「）」(件数以外も。依頼259)", () => {
  const form = read("../components/AccountForm.tsx");
  for (const s of ["グループ名（任意）", "有効期限（任意）", "保管場所メモ（任意）", "円換算レート（任意）", "種類の名前（自由入力）", "完結型（使いきる/失効する）", "継続型（残高が増減し続ける）", '"ポイント（pt）"', "名前（自動）:"]) {
    assert.ok(form.includes(s), s);
  }
  const physical = read("../components/ScanPhysicalUpload.tsx");
  assert.ok(physical.includes('"この内容で登録する（同じものがあれば足す）"'));
  assert.ok(physical.includes("読み取った内訳（確認用）"));
  assert.ok(read("../app/reports/page.tsx").includes("残高の推移（継続型）"));
  // 画面の文(ラベル、ボタン、説明)に、日本語を半角のかっこで囲んだ所がない。
  // ポイント・残高の名前(「PayPayポイント(期間限定)」など。保存した名前と照らし合わせる)と「d(ドコモ)」は、名前なので除く
  for (const f of SCREENS) {
    const src = read(f)
      .replace(/\/\/.*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/console\.\w+\([^\n]*/g, "")
      .replace(/"[^"\n]*ポイント\([^"\n]*\)"/g, "")
      .replace(/d\(ドコモ\)/g, "")
      .replace(/\(通常\)|\(期間限定\)/g, "");
    const m = src.match(/[ぁ-んァ-ヶ一-龠]\([^()\n]*\)|\([ぁ-んァ-ヶ一-龠][^()\n]*\)/);
    assert.ok(!m, f + ": " + (m ? m[0] : ""));
  }
});

test("失敗の文: 直すときは「更新に失敗しました。」、新しく作るときは「登録に失敗しました。」。「保存に失敗」は設定だけ(依頼259)", () => {
  const form = read("../components/AccountForm.tsx");
  assert.ok(form.includes('setErrorMessage(isEditMode ? "更新に失敗しました。もう一度お試しください。" : "登録に失敗しました。もう一度お試しください。");'));
  // 「置き換える」「今回の分を追加する」は、既存を直す
  assert.equal(form.split('setErrorMessage("更新に失敗しました。もう一度お試しください。");').length - 1, 2);
  assert.ok(!form.includes("保存に失敗"));
  assert.ok(read("../components/QuickUpdate.tsx").includes('"更新に失敗しました。もう一度お試しください。"'));
  assert.ok(read("../components/ScanUpload.tsx").includes('"更新に失敗しました。もう一度お試しください。"'));
  assert.ok(read("../components/ScanPhysicalUpload.tsx").includes('matchedAccountId ? "更新に失敗しました。もう一度お試しください。" : "登録に失敗しました。もう一度お試しください。"'));
  assert.ok(read("../components/AccountSettings.tsx").includes("保存に失敗しました。"));
});
