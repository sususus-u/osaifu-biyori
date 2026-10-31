// 日本時間の日付の部品の境目のテスト(依頼365 決定7)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { daysFromToday, daysUntilExpiry, expiryIsoOf, isPastExpiry, jstToday } from "./jstDate.ts";

// 期限 2026-11-01 は、new Date("2026-11-01")(世界標準時の0時。日本時間の9時)で保存されている
const EXPIRY = new Date("2026-11-01");
const at = (iso: string) => new Date(iso);

test("今日は、日本時間の0時で切り替わる(世界標準時の15時)", () => {
  assert.equal(jstToday(at("2026-10-31T14:59:59.999Z")), "2026-10-31"); // 日本時間 10/31 23:59:59
  assert.equal(jstToday(at("2026-10-31T15:00:00.000Z")), "2026-11-01"); // 日本時間 11/01 0:00
  assert.equal(jstToday(at("2026-10-31T23:59:59.999Z").getTime()), "2026-11-01"); // 日本時間 11/01 8:59(前の形では 10/31 だった)
});

test("期限の暦の日付は、保存した時刻の世界標準時の日付", () => {
  assert.equal(expiryIsoOf(EXPIRY), "2026-11-01");
  assert.equal(expiryIsoOf(new Date(Number.NaN)), null);
});

test("残りの日数は、日本時間の0時で1つ減る(0時〜9時に1日多く出ない)", () => {
  assert.equal(daysUntilExpiry(EXPIRY, at("2026-10-30T14:59:59Z")), 2); // 10/30 23:59
  assert.equal(daysUntilExpiry(EXPIRY, at("2026-10-30T15:00:00Z")), 1); // 10/31 0:00
  assert.equal(daysUntilExpiry(EXPIRY, at("2026-10-30T23:00:00Z")), 1); // 10/31 8:00(前の形では 2)
  assert.equal(daysUntilExpiry(EXPIRY, at("2026-10-31T15:00:00Z")), 0); // 当日 0:00
  assert.equal(daysUntilExpiry(EXPIRY, at("2026-11-01T14:59:59Z")), 0); // 当日 23:59
  assert.equal(daysUntilExpiry(EXPIRY, at("2026-11-01T15:00:00Z")), -1); // 次の日 0:00
});

test("「期限が過ぎた」は、期限の次の日の日本時間0時から(当日の9時ではない)", () => {
  assert.equal(isPastExpiry(EXPIRY, at("2026-11-01T00:00:01Z")), false); // 当日 9:00(前の形では、ここで過ぎた)
  assert.equal(isPastExpiry(EXPIRY, at("2026-11-01T14:59:59Z")), false); // 当日 23:59
  assert.equal(isPastExpiry(EXPIRY, at("2026-11-01T15:00:00Z")), true); // 次の日 0:00
});

test("月・年をまたいでも、暦で数える", () => {
  assert.equal(daysFromToday("2027-01-01", at("2026-12-31T15:00:00Z")), 0);
  assert.equal(daysFromToday("2027-03-01", at("2027-02-27T15:00:00Z")), 1); // 2027-02-28 から
  assert.ok(Number.isNaN(daysFromToday("2027-3-1", at("2027-02-27T15:00:00Z"))));
});

test("期限の日数を数える所は、この部品を使う(サーバーの時計の日付で数えない)", () => {
  for (const f of ["app/api/dashboard-items/route.ts", "app/api/send-notifications/route.ts", "components/AccountRow.tsx"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.match(src, /@\/lib\/jstDate/, f);
    assert.doesNotMatch(src, /getFullYear\(\), \w+\.getMonth\(\), \w+\.getDate\(\)/, f);
  }
});
