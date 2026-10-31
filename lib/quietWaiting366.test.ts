// 依頼366 仕事3: ホームから移るときに、文字の画面を出さない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("文字を出さない待ち: 400ms 待ってから、待ちの絵(おさいふびよりの色)だけ。読み上げには「読み込み中」", () => {
  const src = read("../components/QuietWaiting.tsx");
  assert.ok(src.includes("export const QUIET_WAITING_DELAY_MS = 400;"));
  assert.ok(src.includes("useState(false)"));
  assert.ok(src.includes("setTimeout(() => setShown(true), delayMs)"));
  assert.ok(src.includes('<SceneIllust scene="waiting" colors={SCENE_COLORS.osaifu} size={64} />'));
  assert.ok(src.includes('<span className="sr-only">読み込み中</span>'));
  assert.ok(src.includes('role="status"'));
  // 目に見える文字は出さない(読み上げ用の1つだけ)
  assert.ok(!src.includes("読み込み中…"));
  assert.equal(src.split("読み込み中").length - 1, 2, "コメントと読み上げ用の2か所だけ");
  // ふわっと出す。動きを減らす設定では止める
  const css = read("../app/globals.css");
  assert.match(css, /\.quiet-waiting-in \{[^}]*animation: quiet-fade-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.quiet-waiting-in \{\s*animation: none;/);
});

test("ログインの受け取り・確かめの間と、ホームへ移る間は、文字を出さず待ちの絵。失敗のときだけ、今の文の画面", () => {
  const shell = read("../components/AppShell.tsx");
  assert.ok(/if \(isLoading\) \{\s*return \(\s*<div className="app-shell">\s*<QuietWaiting fill \/>/.test(shell));
  const guide = read("../components/LoginGuide.tsx");
  assert.ok(/if \(!handoffFailed && !blocked\) \{\s*return \(\s*<div className="app-shell">\s*<QuietWaiting fill \/>/.test(guide));
  assert.ok(guide.includes("handoffFailedMessage(LOGIN_HANDOFF_PRESETS.osaifu.serviceName)"));
});

test("開いた直後の一覧の読み込みは、「読み込み中…」の文字を出さず、待ちの絵", () => {
  const list = read("../components/AccountList.tsx");
  assert.ok(/if \(isLoading\) \{\s*return <QuietWaiting \/>;/.test(list));
  assert.ok(!list.includes("LOADING_TEXT"));
});
