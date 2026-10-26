import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("知らせは画面の下(下のメニューのすぐ上)に出し、見た目はそろえた形・色はこのサービスの色(依頼229)", () => {
  const toast = read("../components/BottomToast.tsx");
  const css = read("../app/globals.css").replace(/\r\n/g, "\n");
  const tabbar = Number(css.match(/\.tabbar \{[^}]*height: (\d+)px;/)?.[1]);
  assert.match(toast, new RegExp(`export const TABBAR_HEIGHT = ${tabbar};`));
  assert.match(toast, /position: "fixed",/);
  assert.match(toast, /bottom: TABBAR_HEIGHT \+ TOAST_GAP \+ lift,/);
  for (const look of ['background: "#fff"', 'border: "1px solid var(--brand)"', 'borderRadius: "var(--radius-card)"', 'boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)"', "fontSize: 14", "lineHeight: 1.6"]) {
    assert.ok(toast.includes(look), look);
  }
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
  // 「○件を選択中」のバーが出ているときは、その上に出す
  assert.match(list, /lift=\{selectMode \? SELECT_BAR_LIFT : 0\}/);
  // 行が見つかった分は閉じるまで、それ以外は数秒で消える
  assert.match(list, /durationMs=\{noticeText \? undefined : STAMP_TOAST_MS\}/);
  assert.match(list, /highlighted=\{acc\.id in notices\}/);
});
