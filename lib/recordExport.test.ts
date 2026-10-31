// 記録の書き出し(表の形。依頼369)のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXPORT_CONFIRM_TEXT,
  EXPORT_HEADER,
  buildRecordsCsv,
  csvCell,
  expiryText,
  exportFileName,
  jstDateTime,
} from "./recordExport.ts";

test("先頭に BOM、1行目は日本語の項目名、行の区切りは CRLF", () => {
  const csv = buildRecordsCsv({ accounts: [], updates: [], outcomes: [] });
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv, "﻿" + EXPORT_HEADER.join(",") + "\r\n");
  assert.equal(EXPORT_HEADER[0], "記録の種類");
});

test("日付は日本時間、期限は保存の暦の日付", () => {
  // 世界標準時 10/31 15:30 は、日本時間 11/01 0:30
  assert.equal(jstDateTime(new Date("2026-10-31T15:30:00Z")), "2026-11-01 00:30");
  assert.equal(jstDateTime({ toDate: () => new Date("2026-10-31T00:00:00Z") }), "2026-10-31 09:00");
  assert.equal(jstDateTime(null), "");
  assert.equal(expiryText(new Date("2026-11-01")), "2026-11-01");
  assert.equal(expiryText(undefined), "");
});

test("文字の欄: 数式の始まりを止め、カンマ・引用符・改行を囲む", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("@a"), "'@a");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("1行目\n2行目"), '"1行目\n2行目"');
  assert.equal(csvCell("楽天ポイント"), "楽天ポイント");
});

test("3つの記録を、記録の種類で分けて並べる", () => {
  const csv = buildRecordsCsv({
    accounts: [
      {
        id: "a1",
        name: "PayPay",
        categoryLabel: "電子マネー",
        currentBalance: 1200,
        balanceUnit: "円",
        expiryDate: null,
        lastUpdatedAt: new Date("2026-10-30T03:00:00Z"),
        storageLocationMemo: "財布",
      },
    ],
    updates: [
      { accountId: "a1", recordedAt: new Date("2026-10-30T03:00:00Z"), balance: -5, source: "manual" },
    ],
    outcomes: [
      {
        accountId: "a1",
        accountName: "商品券",
        categoryLabel: "商品券・切手",
        eventType: "expired",
        eventDate: new Date("2026-10-01T00:00:00Z"),
        amount: 500,
      },
    ],
  });
  const lines = csv.replace("﻿", "").trimEnd().split("\r\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[1], "ポイント・残高,PayPay,電子マネー,,1200,円,,2026-10-30 12:00,最後に更新した日,,財布");
  assert.equal(lines[2], "残高の履歴,PayPay,電子マネー,,-5,円,,2026-10-30 12:00,手入力,,");
  assert.equal(lines[3], "使いきった・失効した,商品券,商品券・切手,,,,,2026-10-01 09:00,失効した,500,");
});

test("ファイルの名前は、日本時間の今日", () => {
  assert.equal(exportFileName(new Date("2026-10-31T15:00:00Z")), "osaifu-biyori-records-20261101.csv");
});

test("メニューのアカウントの中に、確かめの文つきで置いてある", () => {
  const menu = readFileSync(new URL("../app/menu/page.tsx", import.meta.url), "utf8");
  assert.match(menu, /<RecordExport \/>/);
  const comp = readFileSync(new URL("../components/RecordExport.tsx", import.meta.url), "utf8");
  assert.match(comp, /記録を書き出す\(表の形\)/);
  assert.match(comp, /EXPORT_CONFIRM_TEXT/);
  assert.equal(
    EXPORT_CONFIRM_TEXT,
    "書き出した表には、あなたの記録が入っています。人に渡すときは、気をつけてください。",
  );
  // 無料: プランで止めない
  assert.doesNotMatch(comp, /plan/i);
});
