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

test("1件1件は「項目」。タブは「発行元別」。画面の題", () => {
  const shell = read("../components/AppShell.tsx");
  assert.ok(shell.includes('"/": "おさいふの中身"'));
  assert.ok(shell.includes('"/accounts/new": "項目を登録"'));
  assert.ok(shell.includes('return "項目を編集"'));
  assert.ok(read("../components/AccountList.tsx").includes('label: "発行元別"'));
  const form = read("../components/AccountForm.tsx");
  assert.ok(form.includes("この項目を削除する"));
  assert.ok(!form.includes("このサービス"));
});

test("現物の読み取り: 作ったら「登録しました」、足した・置き換えたら「更新しました」(「保存しました」は設定だけ)", () => {
  const src = read("../components/ScanPhysicalUpload.tsx");
  assert.ok(src.includes('`「${name}」を${matchedAccountId ? "更新しました" : "登録しました"}`'));
  assert.ok(!src.includes("保存しました"));
});

test("お知らせを選んで消す操作は「削除」と書く", () => {
  const src = read("../app/notifications/page.tsx");
  assert.ok(src.includes("選んだお知らせを削除する"));
  assert.ok(src.includes('件を削除する"'));
  assert.ok(!src.includes("消しますか"));
});

test("利用者向けの通知の題は「おさいふびより:何の知らせか」", () => {
  assert.ok(read("../app/api/send-notifications/route.ts").includes('title: "おさいふびより:期限のお知らせ"'));
  assert.ok(read("./messaging.ts").includes('|| "おさいふびより:お知らせ"'));
  assert.ok(read("../scripts/firebase-messaging-sw.template.js").includes('|| "おさいふびより:お知らせ"'));
});
