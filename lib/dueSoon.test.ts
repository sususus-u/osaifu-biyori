import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DUE_SOON_LEAD, daysUntil, dueSoonText, pickDueSoon } from "./dueSoon.ts";

test("日数は、期限の日付と、日本時間の今日の日付の差(依頼318)", () => {
  assert.equal(daysUntil("2026-11-05", "2026-10-30"), 6);
  assert.equal(daysUntil("2026-10-30", "2026-10-30"), 0);
  assert.equal(daysUntil("2026-10-29", "2026-10-30"), -1);
  assert.equal(daysUntil("2027-01-02", "2026-12-30"), 3);
  assert.equal(daysUntil("x", "2026-10-30"), null);
});

test("出すのは、当日から7日前まで(毎朝のお知らせと同じ)。期限の近い順", () => {
  const items = [
    { id: "a", expiryIso: "2026-11-06" }, // 7日
    { id: "b", expiryIso: "2026-10-30" }, // 当日
    { id: "c", expiryIso: "2026-11-07" }, // 8日(出さない)
    { id: "d", expiryIso: "2026-10-29" }, // 過ぎた(出さない)
    { id: "e", expiryIso: null }, // 期限なし(出さない)
    { id: "f", expiryIso: "2026-11-01" }, // 2日
  ];
  const picked = pickDueSoon(items, "2026-10-30");
  assert.deepEqual(
    picked.map((p) => [p.id, p.days]),
    [
      ["b", 0],
      ["f", 2],
      ["a", 7],
    ],
  );
});

test("気づきのお知らせも出す: いちばん早い気づきの日から当日まで(依頼317 仕事1の決定15)", () => {
  const items = [
    { id: "a", expiryIso: "2026-12-29", fromDays: 60 }, // 60日(気づきの日。出す)
    { id: "b", expiryIso: "2026-12-30", fromDays: 60 }, // 61日(まだ。出さない)
    { id: "c", expiryIso: "2026-11-29", fromDays: 30 }, // 30日(出す)
    { id: "d", expiryIso: "2026-11-29", fromDays: null }, // 30日、気づきなし(出さない)
    { id: "e", expiryIso: "2026-11-03", fromDays: null }, // 4日、気づきなし(直前なので出す)
    { id: "f", expiryIso: "2027-02-27", fromDays: 120 }, // 120日(出す)
  ];
  const picked = pickDueSoon(items, "2026-10-30");
  assert.deepEqual(
    picked.map((p) => [p.id, p.days]),
    [
      ["e", 4],
      ["c", 30],
      ["a", 60],
      ["f", 120],
    ],
  );
});

test("一覧の上のひとこと", () => {
  assert.equal(DUE_SOON_LEAD, "お知らせの時期に入ったポイント・残高です（期限の近い順）。");
  const src = readFileSync(new URL("../app/notifications/page.tsx", import.meta.url), "utf8");
  assert.match(src, /fromDays: earliestReminderDay\(selectedReminderDays\(account\.notificationTiming\)\)/);
});

test("名前の下の文字", () => {
  assert.equal(dueSoonText(0, "2026-10-30"), "今日が期限です");
  assert.equal(dueSoonText(3, "2026-11-02"), "あと3日（11月2日まで）");
});

test("「あなたへのお知らせ」は、自分のポイント・残高から作り、一覧の決まりを守る(依頼318)", () => {
  const src = readFileSync(new URL("../app/notifications/page.tsx", import.meta.url), "utf8");
  assert.match(src, /where\("ownerId", "==", uid\)/);
  assert.match(src, /pickDueSoon\(/);
  // 行を押すと「ポイント・残高を編集」(一覧と同じ部品)
  assert.match(src, /<AccountRow/);
  // 枠、「全○件」、ゼロ件の文、読み込み中
  assert.match(src, /className="card"/);
  assert.match(src, /listCountText\(due\.length\)/);
  assert.match(src, /ANNOUNCEMENT_EMPTY_TEXT/);
  // 読み込み中は、文字を出さない待ちの絵(依頼366 仕事4)
  assert.match(src, /<QuietWaiting \/>/);
});
