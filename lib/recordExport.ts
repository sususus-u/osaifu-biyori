// 記録の書き出し(表の形。依頼369。依頼341 の決定7)。
// 自分のポイント・残高と、残高の履歴、使いきった・失効した記録を、1つの CSV にまとめる。
// - 1行目は、項目の名前(日本語)。1列目「記録の種類」で、3つの記録を見分ける
// - 日付は日本時間。期限は、保存の形(世界標準時の0時)から暦の日付を出す(lib/jstDate.ts の expiryIsoOf)
// - スマホの表計算で文字化けしないよう、先頭に UTF-8 の BOM、行の区切りは CRLF
// - 文字の欄が = + - @ などで始まるときは、先頭に ' を付けて、数式として動かないようにする
// 画面からの読み取りと保存は components/RecordExport.tsx。ここは、データから文字を作るだけ(テストできる形)。

import { expiryIsoOf } from "./jstDate.ts";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const EXPORT_HEADER = [
  "記録の種類",
  "ポイント・残高の名前",
  "分類",
  "グループ名",
  "残高",
  "単位",
  "期限",
  "日付(日本時間)",
  "内容",
  "金額(円)",
  "保管場所のメモ",
] as const;

export const KIND_ACCOUNT = "ポイント・残高";
export const KIND_UPDATE = "残高の履歴";
export const KIND_OUTCOME = "使いきった・失効した";

// 時刻の値は、Date か、Firestore の Timestamp(toDate を持つもの)
type TimeLike = Date | { toDate: () => Date } | null | undefined;

export interface ExportAccount {
  id: string;
  name?: string;
  categoryLabel?: string;
  groupName?: string;
  currentBalance?: number | null;
  balanceUnit?: string;
  expiryDate?: TimeLike;
  lastUpdatedAt?: TimeLike;
  storageLocationMemo?: string;
}

export interface ExportUpdate {
  accountId: string;
  recordedAt?: TimeLike;
  balance?: number | null;
  expiryDate?: TimeLike;
  source?: string;
}

export interface ExportOutcome {
  accountId?: string;
  accountName?: string;
  categoryLabel?: string;
  eventType?: string;
  eventDate?: TimeLike;
  amount?: number | null;
}

const SOURCE_LABELS: Record<string, string> = {
  screenshot: "スクショの読み取り",
  photo_simple: "写真の読み取り",
  photo_count: "写真の読み取り(数える)",
  manual: "手入力",
};

const OUTCOME_LABELS: Record<string, string> = {
  used_up: "使いきった",
  expired: "失効した",
};

function toDate(v: TimeLike): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : typeof v.toDate === "function" ? v.toDate() : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

/** 日本時間の "YYYY-MM-DD HH:mm"。読めない値は空 */
export function jstDateTime(v: TimeLike): string {
  const d = toDate(v);
  if (!d) return "";
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

/** 期限の暦の日付 "YYYY-MM-DD"。なし・読めない値は空 */
export function expiryText(v: TimeLike): string {
  const d = toDate(v);
  return d ? (expiryIsoOf(d) ?? "") : "";
}

function numText(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

/** 1つの欄を CSV の形に(数式の始まりを止め、" と , と改行を囲む) */
export function csvCell(value: string): string {
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// 数の欄は、数式の止めを付けない(-100 などをそのまま数として読めるように。数の欄は数字しか入らない)
function row(cells: { text: string; num?: boolean }[]): string {
  return cells.map((c) => (c.num ? c.text : csvCell(c.text))).join(",");
}

const t = (text: string | undefined) => ({ text: text ?? "" });
const n = (v: number | null | undefined) => ({ text: numText(v), num: true });

function timeOf(v: TimeLike): number {
  return toDate(v)?.getTime() ?? 0;
}

/** 書き出す CSV の文字(BOM つき、CRLF) */
export function buildRecordsCsv(input: {
  accounts: ExportAccount[];
  updates: ExportUpdate[];
  outcomes: ExportOutcome[];
}): string {
  const accounts = [...input.accounts].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ja"));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const lines: string[] = [EXPORT_HEADER.map(csvCell).join(",")];

  for (const a of accounts) {
    lines.push(
      row([
        t(KIND_ACCOUNT),
        t(a.name),
        t(a.categoryLabel),
        t(a.groupName),
        n(a.currentBalance),
        t(a.balanceUnit),
        t(expiryText(a.expiryDate)),
        t(jstDateTime(a.lastUpdatedAt)),
        t("最後に更新した日"),
        t(""),
        t(a.storageLocationMemo),
      ]),
    );
  }

  const updates = [...input.updates].sort((x, y) => {
    const nx = byId.get(x.accountId)?.name ?? "";
    const ny = byId.get(y.accountId)?.name ?? "";
    return nx === ny ? timeOf(x.recordedAt) - timeOf(y.recordedAt) : nx.localeCompare(ny, "ja");
  });
  for (const u of updates) {
    const a = byId.get(u.accountId);
    lines.push(
      row([
        t(KIND_UPDATE),
        t(a?.name),
        t(a?.categoryLabel),
        t(a?.groupName),
        n(u.balance),
        t(a?.balanceUnit),
        t(expiryText(u.expiryDate)),
        t(jstDateTime(u.recordedAt)),
        t(SOURCE_LABELS[u.source ?? ""] ?? ""),
        t(""),
        t(""),
      ]),
    );
  }

  const outcomes = [...input.outcomes].sort((x, y) => timeOf(x.eventDate) - timeOf(y.eventDate));
  for (const o of outcomes) {
    const a = o.accountId ? byId.get(o.accountId) : undefined;
    lines.push(
      row([
        t(KIND_OUTCOME),
        t(o.accountName ?? a?.name),
        t(o.categoryLabel ?? a?.categoryLabel),
        t(a?.groupName),
        t(""),
        t(""),
        t(""),
        t(jstDateTime(o.eventDate)),
        t(OUTCOME_LABELS[o.eventType ?? ""] ?? ""),
        n(o.amount),
        t(""),
      ]),
    );
  }

  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** ファイルの名前(日本時間の今日)。例: osaifu-biyori-records-20261031.csv */
export function exportFileName(now: Date = new Date()): string {
  const ymd = new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");
  return `osaifu-biyori-records-${ymd}.csv`;
}

export const EXPORT_CONFIRM_TEXT =
  "書き出した表には、あなたの記録が入っています。人に渡すときは、気をつけてください。";
