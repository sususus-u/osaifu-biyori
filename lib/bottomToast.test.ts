import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { STAMP_TOAST_MS, mergeSavedPayload, peekStampSavedMessage, stashStampSavedMessage, appendStampSavedMessage } from "./stampToast.ts";
import { createdNotice, deletedNotice, expiredNotice, updatedNotice } from "./savedNotice.ts";
import { decodeBefore, isSavedUndo, makeUndoCapture, pickBefore, undoDoneMessage } from "./undoRestore.ts";

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
  assert.match(list, /onUndo=\{undo \? handleUndo : undefined\}/);
  assert.match(list, /highlighted=\{acc\.id in notices\}/);
  // 行の印は、塗らずに左の端の線(期限が過ぎた行のクリーム色と見分ける)
  const row = read("../components/AccountRow.tsx");
  assert.match(row, /highlighted \? \{ boxShadow: "inset 4px 0 0 var\(--brand\)" \}/);
  assert.doesNotMatch(row, /#f8ebe6/);
});

test("編集の画面: 更新・登録・削除のあと、一覧に戻ったときの知らせ(依頼231)。更新と登録は「元に戻す」付き(依頼232)", () => {
  const restore = { id: "a1", before: { currentBalance: 100 }, updateIds: ["u1"] };
  assert.deepEqual(updatedNotice("a1", " 楽天ポイント ", restore), {
    message: "「楽天ポイント」を更新しました",
    items: [{ id: "a1", kind: "add", text: "「楽天ポイント」を更新しました" }],
    undo: { createIds: [], restores: [restore] },
  });
  assert.deepEqual(createdNotice("a2", "PayPay"), {
    message: "「PayPay」を登録しました",
    items: [{ id: "a2", kind: "create", text: "「PayPay」を登録しました" }],
    undo: { createIds: ["a2"], restores: [] },
  });
  assert.deepEqual(deletedNotice("nanaco"), { message: "「nanaco」を削除しました", items: [] });
  const form = read("../components/AccountForm.tsx");
  const has = (src: string, s: string) => assert.ok(src.includes(s), s);
  has(form, "const before = await captureBefore(accountId, Object.keys(payload));");
  has(form, "rememberSaved(updatedNotice(accountId, name, { id: accountId, before, updateIds: [updateRef.id] }));");
  has(form, "rememberSaved(createdNotice(docRef.id, name));");
  has(form, "stashStampSavedMessage(window.sessionStorage, deletedNotice(name));");
  // スクショを続けて登録する途中は、足して入れる
  has(form, 'if (sessionStorage.getItem("scan-prefill-queue")) appendStampSavedMessage');
  // スクショの「更新しました」とクイック更新も「元に戻す」付き
  has(read("../components/ScanUpload.tsx"), 'goToPendingQueueOrHome("更新しました", restores);');
  has(read("../components/QuickUpdate.tsx"), "onUndo={undo ? handleUndo : undefined}");
});

test("続けて登録: まとめて出す。「元に戻す」は全部が元に戻せるときだけ。保存した形を読み直せる", () => {
  const s = new MemStorage();
  stashStampSavedMessage(s, createdNotice("a", "A"));
  appendStampSavedMessage(s, updatedNotice("b", "B", { id: "b", before: { x: 1 }, updateIds: [] }));
  const both = peekStampSavedMessage(s)!;
  assert.equal(both.message, ["「A」を登録しました", "「B」を更新しました"].join("\n"));
  assert.deepEqual(both.undo, { createIds: ["a"], restores: [{ id: "b", before: { x: 1 }, updateIds: [] }] });
  assert.equal(both.items.length, 2);
  // 今回の分の追加(元に戻せない)が混じると、「元に戻す」は付かない
  appendStampSavedMessage(s, { message: "足しました", items: [] });
  assert.equal(peekStampSavedMessage(s)!.undo, undefined);
  assert.equal(mergeSavedPayload(null, deletedNotice("D")).message, "「D」を削除しました");
});

test("直す前の値: 日時と、無かった項目も、JSON を通して書き戻せる(依頼232)", () => {
  const fakeTs = { seconds: 100, nanoseconds: 5, toMillis: () => 100000 };
  const data = { currentBalance: 500, expiryDate: fakeTs, notificationTiming: { firstStageDays: 90, secondStageDays: 21 } };
  const before = JSON.parse(JSON.stringify(pickBefore(data, ["currentBalance", "expiryDate", "notificationTiming", "groupName"])));
  assert.deepEqual(before.expiryDate, { __ts: [100, 5] });
  assert.deepEqual(before.groupName, { __delete: true });
  const out = decodeBefore(before, (s, ns) => ({ ts: [s, ns] }), () => "DEL");
  assert.deepEqual(out, { currentBalance: 500, expiryDate: { ts: [100, 5] }, notificationTiming: { firstStageDays: 90, secondStageDays: 21 }, groupName: "DEL" });
  assert.equal(undoDoneMessage({ createIds: ["a"], restores: [] }), "登録を取り消しました");
  assert.equal(undoDoneMessage({ createIds: [], restores: [{ id: "b", before: {}, updateIds: [] }] }), "元に戻しました");
  assert.equal(isSavedUndo({ createIds: [], restores: [] }), false);
  assert.equal(isSavedUndo({ createIds: [""], restores: [] }), false);
});

test("切手の保存・今回の分の追加・現物の保存も「元に戻す」付き。トランザクションで読んだ値と足した履歴を控える(依頼232)", () => {
  const c = makeUndoCapture();
  c.onRead("a", { currentBalance: 100, itemQuantity: 1 });
  c.onHistory("a", "h0");
  c.onRead("a", { currentBalance: 200, itemQuantity: 2 }); // やり直し: 最後に読んだ値
  c.onHistory("a", "h1");
  assert.deepEqual(c.restoreFor("a", ["currentBalance", "itemQuantity", "faceValue"]), {
    id: "a",
    before: { currentBalance: 200, itemQuantity: 2, faceValue: { __delete: true } },
    updateIds: ["h1"],
  });
  const has = (src: string, s: string) => assert.ok(src.includes(s), s);
  const physical = read("../components/ScanPhysicalUpload.tsx");
  has(physical, "saveStamps(firestoreStampDeps(uid, expiry, capture), saveRows)");
  has(physical, "{ message: result.message, items: result.items, undo }");
  has(physical, "undo = { createIds: [created.id], restores: [] };");
  has(read("../components/AccountForm.tsx"), "undo: { createIds: [], restores: [restore] },");
  has(read("../lib/manualAddFirestore.ts"), "capture?.onHistory(id, ref.id);");
  // 履歴も消える削除の確認は「元に戻せません」と書く
  has(read("../components/AccountForm.tsx"), 'description="元に戻せません。履歴も一緒に消えます。"');
});

test("「失効した」(依頼234): 残高が続く種類は「元に戻す」付き(記録も消す)。使い切りの種類は「元に戻せません」と書く", () => {
  const restore = { id: "a1", before: { currentBalance: 300 }, updateIds: [] };
  const n = expiredNotice("a1", "dポイント", restore, "o1");
  assert.equal(n.message, "「dポイント」の失効を記録しました");
  assert.deepEqual(n.undo, { createIds: [], restores: [restore], outcomeIds: ["o1"] });
  assert.equal(isSavedUndo(n.undo), true);
  assert.equal(isSavedUndo({ ...n.undo, outcomeIds: [""] }), false);
  assert.equal(undoDoneMessage(n.undo!), "元に戻しました");
  const s = new MemStorage();
  stashStampSavedMessage(s, n);
  assert.deepEqual(peekStampSavedMessage(s)!.undo, n.undo);
  const has = (src: string, s: string) => assert.ok(src.includes(s), s);
  const form = read("../components/AccountForm.tsx");
  has(form, "expiredNotice(accountId, name, { id: accountId, before, updateIds: [] }, outcomeRef.id),");
  has(form, '"記録を残し、このサービスは一覧から消えます。元に戻せません。"');
  has(read("./undoRestoreFirestore.ts"), 'await deleteDoc(doc(db, "outcome_events", outcomeId));');
});

test("下のメニューは3つのサービス共通の作り(依頼234): 高さ78px、下の端の余白を見る、画面全体はスクロールしない", () => {
  const css = read("../app/globals.css").replace(/\r\n/g, "\n");
  const rule = (head: string) => {
    const start = css.indexOf(`\n${head} {`);
    assert.ok(start >= 0, head);
    return css.slice(start, css.indexOf("}", start) + 1);
  };
  assert.match(rule(".tabbar"), /height: 78px;/);
  assert.match(rule(".tabbar"), /padding-bottom: max\(14px, env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\nbody \{\n  overflow: hidden;\n  overscroll-behavior: none;\n\}/);
  assert.match(rule(".app-shell"), /height: 100dvh;/);
  assert.match(rule(".scroll"), /overscroll-behavior-y: contain;/);
  assert.match(read("../app/layout.tsx"), /viewportFit: "cover",/);
});
