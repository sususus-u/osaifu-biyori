// 依頼366 仕事4: 場面の絵(案A「しるしの点」)を、おさいふびよりの各場面で使う。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sceneForMessage } from "./sceneNotice.ts";
import { SCAN_FAILED_MESSAGE } from "./scanImage.ts";
import { AI_PAUSED_MESSAGE } from "./aiPaused.ts";
import { AI_PLAN_LIMIT_MESSAGES } from "./plan-resolve.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("知らせの文に添える絵: 上限は limit、読み取り・通信・保存の失敗は error、入力の確かめは絵なし", () => {
  // 上限(AI の回数・AI を休んでいる・ポイント・残高の数)
  assert.equal(sceneForMessage(AI_PLAN_LIMIT_MESSAGES.daily), "limit");
  assert.equal(sceneForMessage(AI_PLAN_LIMIT_MESSAGES.monthly), "limit");
  assert.equal(sceneForMessage(AI_PAUSED_MESSAGE), "limit");
  assert.equal(sceneForMessage("ポイント・残高の数の上限に達しました。不要なポイント・残高を削除するか、プランの変更をご検討ください。"), "limit");
  // 失敗
  assert.equal(sceneForMessage(SCAN_FAILED_MESSAGE), "error");
  assert.equal(sceneForMessage("登録に失敗しました。もう一度お試しください。"), "error");
  assert.equal(sceneForMessage("更新に失敗しました。もう一度お試しください。"), "error");
  assert.equal(sceneForMessage("サービス名を読み取れませんでした。手入力で登録してください。"), "error");
  assert.equal(sceneForMessage("画像を読み込めませんでした。もう一度、撮り直してください"), "error");
  assert.equal(sceneForMessage("読み取れる内容がありませんでした。手入力で登録してください。"), "error");
  // 入力の確かめは、文だけ(かさばらないように)
  assert.equal(sceneForMessage("名前を入力してください。"), null);
  assert.equal(sceneForMessage("額面と枚数を入力してください。"), null);
  assert.equal(sceneForMessage("有効期限/期限なしを選択してください。"), null);
  assert.equal(sceneForMessage(""), null);
});

test("失敗・上限の文の部品: 絵はおさいふびよりの色で、文の色は置いた所のまま。読み取りの3つの画面とクイック更新で使う", () => {
  const notice = read("../components/SceneNotice.tsx");
  assert.ok(notice.includes("<SceneIllust scene={scene} colors={SCENE_COLORS.osaifu} size={40} />"));
  assert.ok(notice.includes('role="alert"'));
  assert.ok(read("../components/AccountForm.tsx").includes('<SceneNotice message={errorMessage} textStyle={{ fontSize: 13, color: "#b3261e" }} style={{ marginBottom: 20 }} />'));
  assert.ok(read("../components/ScanPhysicalUpload.tsx").includes('<SceneNotice message={errorMessage} textStyle={{ fontSize: 13, color: "#b3261e" }} />'));
  const scan = read("../components/ScanUpload.tsx");
  assert.equal(scan.split("<SceneNotice message={errorMessage}").length - 1, 2);
  assert.ok(read("../components/QuickUpdate.tsx").includes('<SceneNotice message={saveError} textClassName="text-sm text-red-700" />'));
});

test("AI の読み取り中: 回る輪(CSS)をやめ、待ちの絵に。文はそのまま", () => {
  const busy = read("../components/BusyIndicator.tsx");
  assert.ok(busy.includes('<SceneIllust scene="waiting" colors={SCENE_COLORS.osaifu} size={64} />'));
  assert.ok(!busy.includes("busy-spinner"));
  assert.ok(busy.includes('<p className="busy-title">{title}</p>'));
  assert.ok(!read("../app/globals.css").includes(".busy-spinner"));
});

test("一覧がからっぽ: 主な一覧(4か所)とクイック更新の点線の枠に、からっぽの絵。実績は、記録のない月に絵と短い文", () => {
  const empty = read("../components/EmptyIllust.tsx");
  assert.ok(empty.includes('<SceneIllust scene="empty" colors={SCENE_COLORS.osaifu} size={56} className="list-empty-illust" />'));
  const list = read("../components/AccountList.tsx");
  assert.equal(list.split("<EmptyIllust />").length - 1, 4);
  assert.ok(read("../components/QuickUpdate.tsx").includes('<div className="list-empty">\n            <EmptyIllust />'));
  const rep = read("../app/reports/page.tsx");
  assert.ok(rep.includes('<SceneMessage scene="empty" colors={SCENE_COLORS.osaifu} size={56} text="この月の記録はありません" />'));
  // 字は 14px・補足の色(下限 12px・4.5:1 を守る)
  assert.ok(rep.includes('<div style={{ fontSize: 14, color: "var(--text-muted)" }}>\n              <SceneMessage'));
});

test("ログインのお願い(引き継げなかったとき): 絵と、今の文", () => {
  const guide = read("../components/LoginGuide.tsx");
  assert.ok(guide.includes('<SceneIllust scene="login" colors={SCENE_COLORS.osaifu} size={64} />'));
  assert.ok(guide.indexOf('scene="login"') < guide.indexOf("handoffFailedMessage(LOGIN_HANDOFF_PRESETS.osaifu.serviceName)"));
});

test("読み込み中(登録・編集、クイック更新、実績、お知らせ)は、文字を出さない待ちの絵", () => {
  for (const f of ["../components/AccountForm.tsx", "../components/QuickUpdate.tsx", "../app/reports/page.tsx", "../app/notifications/page.tsx", "../app/notifications/all/page.tsx"]) {
    const src = read(f);
    assert.ok(src.includes("<QuietWaiting />"), f);
    assert.ok(!src.includes("読み込み中…"), f);
    assert.ok(!src.includes("LOADING_TEXT"), f);
  }
});
