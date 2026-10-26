import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { STAMP_TOAST_MS, mergeSavedPayload, peekStampSavedMessage, stashStampSavedMessage, appendStampSavedMessage } from "./stampToast.ts";
import { createdNotice, deletedNotice, updatedNotice } from "./savedNotice.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// 文字と地の見やすさ(WCAG のコントラスト比)
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

test("知らせは画面の下(下のメニューのすぐ上)。地をサービスの色で塗り、文字は白、左に ✓。見やすさ 4.5:1 以上(依頼229・依頼231)", () => {
  const toast = read("../components/BottomToast.tsx");
  const css = read("../app/globals.css").replace(/\r\n/g, "\n");
  const tabbar = Number(css.match(/\.tabbar \{[^}]*height: (\d+)px;/)?.[1]);
  const brand = css.match(/--brand: (#[0-9a-fA-F]{6});/)?.[1] ?? "";
  assert.ok(contrast(brand, "#ffffff") >= 4.5, brand);
  assert.match(toast, new RegExp(`export const TABBAR_HEIGHT = ${tabbar};`));
  assert.match(toast, /position: "fixed",/);
  assert.match(toast, /bottom: TABBAR_HEIGHT \+ TOAST_GAP \+ lift,/);
  for (const look of ['color: "#fff"', 'background: "var(--brand)"', 'border: "1px solid var(--brand)"', 'borderRadius: "var(--radius-card)"', 'boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)"', "fontSize: 14", "lineHeight: 1.6"]) {
    assert.ok(toast.includes(look), look);
  }
  assert.match(toast, /\{done && \(\s+<span aria-hidden="true"[^>]*>\s+✓/);
  // 「元に戻す」は白い線と白い文字、✕ は白い文字。「元に戻す」付きは時間で消さず、次の操作(外を押す、Esc)で閉じる
  assert.match(toast, /background: "transparent",\s+color: "#fff",\s+border: "1\.5px solid #fff",/);
  assert.match(toast, /aria-label="閉じる"[\s\S]{0,300}color: "#fff",/);
  assert.match(toast, /if \(hasUndo \|\| durationMs === undefined\) return;/);
  assert.match(toast, /document\.addEventListener\("click", onClick, true\);/);
  assert.equal(STAMP_TOAST_MS, 6000);
  // 出ている間は、その高さの分を一覧の下の余白に足す
  assert.match(toast, /setProperty\("--bottom-toast-space"/);
  assert.match(css, /padding: 20px 20px calc\(100px \+ var\(--bottom-toast-space, 0px\)\);/);
});

test("短い知らせは、どの画面も BottomToast を使う。上に出す部品と、行の下の案内は残っていない", () => {
  assert.equal(existsSync(new URL("../components/StampSavedToast.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../components/StampRowNotice.tsx", import.meta.url)), false);
  for (const f of [
    "../components/AccountList.tsx",
    "../app/notifications/page.tsx",
    "../components/AccountSettings.tsx",
    "../components/QuickUpdate.tsx",
    "../components/ScanPhysicalUpload.tsx",
    "../components/ScanUpload.tsx",
  ]) {
    assert.match(read(f), /<BottomToast/, f);
  }
  const list = read("../components/AccountList.tsx");
  assert.match(list, /lift=\{selectMode \? SELECT_BAR_LIFT : 0\}/);
  // 「元に戻す」が無いものは6秒。登録は「元に戻す」付き
  assert.match(list, /durationMs=\{STAMP_TOAST_MS\}/);
  assert.match(list, /onUndo=\{undoIds \? handleUndo : undefined\}/);
  assert.match(list, /highlighted=\{acc\.id in notices\}/);
  // 行の印は、塗らずに左の端の線(期限が過ぎた行のクリーム色と見分ける)
  const row = read("../components/AccountRow.tsx");
  assert.match(row, /highlighted \? \{ boxShadow: "inset 4px 0 0 var\(--brand\)" \}/);
  assert.doesNotMatch(row, /#f8ebe6/);
});

test("編集の画面: 更新・登録・削除のあと、一覧に戻ったときの知らせ(依頼231)", () => {
  assert.deepEqual(updatedNotice("a1", " 楽天ポイント "), {
    message: "「楽天ポイント」を更新しました",
    items: [{ id: "a1", kind: "add", text: "「楽天ポイント」を更新しました" }],
  });
  assert.deepEqual(createdNotice("a2", "PayPay"), {
    message: "「PayPay」を登録しました",
    items: [{ id: "a2", kind: "create", text: "「PayPay」を登録しました" }],
    undoIds: ["a2"],
  });
  assert.deepEqual(deletedNotice("nanaco"), { message: "「nanaco」を削除しました", items: [] });
  const form = read("../components/AccountForm.tsx");
  assert.match(form, /rememberSaved\(updatedNotice\(accountId, name\)\);\s+router\.push\("\/"\);/);
  assert.match(form, /rememberSaved\(createdNotice\(docRef\.id, name\)\);\s+goToNextQueueItemOrHome\(\);/);
  assert.match(form, /stashStampSavedMessage\(window\.sessionStorage, deletedNotice\(name\)\);\s+router\.push\("\/"\);/);
  // スクショを続けて登録する途中は、足して入れる
  assert.match(form, /if \(sessionStorage\.getItem\("scan-prefill-queue"\)\) appendStampSavedMessage/);
});

test("続けて登録: まとめて出す。「元に戻す」は全部が登録のときだけ。保存した形を読み直せる", () => {
  const s = new MemStorage();
  stashStampSavedMessage(s, createdNotice("a", "A"));
  appendStampSavedMessage(s, createdNotice("b", "B"));
  const both = peekStampSavedMessage(s)!;
  assert.equal(both.message, "「A」を登録しました\n「B」を登録しました");
  assert.deepEqual(both.undoIds, ["a", "b"]);
  assert.equal(both.items.length, 2);
  appendStampSavedMessage(s, updatedNotice("c", "C"));
  assert.equal(peekStampSavedMessage(s)!.undoIds, undefined);
  assert.equal(mergeSavedPayload(null, deletedNotice("D")).message, "「D」を削除しました");
});
