// 下のメニューの「+ 登録」の丸(依頼274。3つのサービス共通)の試験。
// 丸は直径58px(白い縁3px を含む)、地はブランドの色、上の端はメニューの上の線より 8px 上(下の余白には関係させない)。
// 開いている間も見た目を変えない。メニューの上に出す帯は、丸の上の端より 8px 上に置く。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "./stampNameView.ts";

const root = join(import.meta.dirname, "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const css = read("app", "globals.css");
const shell = read("components", "AppShell.tsx");
const toast = read("components", "BottomToast.tsx");
const list = read("components", "AccountList.tsx");

function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `${selector} の決まりがない`);
  return m[1];
}
function token(name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, name);
  return m[1];
}
function constant(name: string): string {
  const m = toast.match(new RegExp(`export const ${name} = ([^;]+);`));
  assert.ok(m, name);
  return m[1];
}

test("丸は直径58px(白い縁3px を含む、box-sizing: border-box)、まんまる、地はブランドの色、影は 0 2px 6px rgba(0,0,0,0.25)", () => {
  const r = rule(".tabbar-add-circle");
  assert.match(r, /width:\s*58px/);
  assert.match(r, /height:\s*58px/);
  assert.match(r, /border:\s*3px solid #fff/);
  assert.match(r, /box-sizing:\s*border-box/);
  assert.match(r, /border-radius:\s*50%/);
  assert.match(r, /background:\s*var\(--brand\)/);
  assert.match(r, /box-shadow:\s*0 2px 6px rgba\(0, 0, 0, 0\.25\)/);
  assert.match(r, /gap:\s*1px/);
});

test("飛び出す高さは --register-protrusion: 8px。丸は項目の上の端から、上の線(0.5px)と 8px だけ上。横は真ん中", () => {
  assert.match(css, /--register-protrusion:\s*8px;/);
  assert.match(rule(".tabbar"), /border-top:\s*0\.5px solid/);
  assert.match(rule(".tabbar-add"), /position:\s*relative/);
  const r = rule(".tabbar-add-circle");
  assert.match(r, /position:\s*absolute/);
  assert.match(r, /top:\s*calc\(-1 \* var\(--register-protrusion\) - 0\.5px\)/);
  assert.match(r, /left:\s*50%/);
  assert.match(r, /transform:\s*translateX\(-50%\)/);
});

test("丸の位置は下の余白(safe-area)に関係させない。メニューの高さ78pxと下の余白の決まりはそのまま", () => {
  const all = [".tabbar-add", ".tabbar-add-circle", ".tabbar-add-label"].map(rule).join("\n");
  assert.doesNotMatch(all, /safe-area/);
  assert.doesNotMatch(all, /bottom:/);
  assert.doesNotMatch(all, /margin/);
  const bar = rule(".tabbar");
  assert.match(bar, /height:\s*78px/);
  assert.match(bar, /padding-bottom:\s*max\(14px, env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(bar, /overflow/);
});

test("「登録」の画面を開いている間も、丸の見た目は変えない(--brand-dark や active の決まりがない。aria-current は付ける)", () => {
  assert.doesNotMatch(css, /\.tabbar-add\.active/);
  assert.doesNotMatch(rule(".tabbar-add-circle"), /brand-dark/);
  assert.match(shell, /className="tabbar-item tabbar-add"/);
  assert.match(shell, /aria-current=\{tab\.active \? "page" : undefined\}/);
});

test("「+」は20px・線の太さ2.5、「登録」は丸の中(12px、太字、行の高さ1)。丸の下に別の字を置かない", () => {
  const label = rule(".tabbar-add-label");
  assert.match(label, /font-size:\s*12px/);
  assert.match(label, /font-weight:\s*700/);
  assert.match(label, /line-height:\s*1\b/);
  const m = shell.match(/<span className="tabbar-add-circle">([\s\S]*?)<\/span>\n\s*<\/Link>/);
  assert.ok(m, "丸の中身が見つからない");
  assert.match(m[1], /<Plus size=\{20\} strokeWidth=\{2\.5\}/);
  assert.match(m[1], /className="tabbar-add-label"/);
  assert.match(shell, /aria-label="登録"/);
});

test("ほかの項目と同じ幅(tabbar-item の flex: 1)で、行き先は /accounts/new のまま。キーボードの印が見える", () => {
  assert.match(shell, /href: "\/accounts\/new"/);
  assert.match(rule(".tabbar-item"), /flex:\s*1/);
  assert.match(rule(".tabbar-add:focus-visible .tabbar-add-circle"), /outline:\s*2px solid/);
});

test("メニューの上に出す帯は、丸の上の端より 8px 上(画面の下から 78 + 8 + 8 = 94px)。中身の下の余白 100px は 78 + 8 より大きい", () => {
  const protrusion = Number(css.match(/--register-protrusion:\s*(\d+)px;/)?.[1]);
  assert.equal(constant("TABBAR_HEIGHT"), "78");
  assert.equal(Number(constant("REGISTER_PROTRUSION")), protrusion);
  assert.equal(Number(constant("REGISTER_CLEARANCE")), 8);
  assert.equal(constant("FLOAT_BOTTOM"), "TABBAR_HEIGHT + REGISTER_PROTRUSION + REGISTER_CLEARANCE");
  const floatBottom = 78 + protrusion + 4;
  assert.ok(floatBottom >= 78 + 8 + 4);
  // 「元に戻す」などの知らせ(BottomToast): 選択のバーが無いとき 94px、あるときはバー(65px)とすき間 8px の上
  assert.match(toast, /bottom: FLOAT_BOTTOM \+ lift,/);
  assert.equal(constant("SELECT_BAR_LIFT"), "65 + TOAST_GAP");
  // 「○件を選択中」のバー(AccountList)
  assert.match(list, /position: "fixed",\n\s*bottom: FLOAT_BOTTOM,/);
  assert.doesNotMatch(list, /bottom: 78\b/);
  // 中身のいちばん下の余白
  const pad = Number(rule(".scroll").match(/padding: 20px 20px calc\((\d+)px/)?.[1]);
  assert.ok(pad > 78 + protrusion, String(pad));
});

test("白い字とブランドの色の比は 4.5:1 以上(--brand 10.29:1)", () => {
  const brand = token("--brand");
  assert.equal(contrastRatio("#ffffff", brand).toFixed(2), "10.29");
  assert.ok(contrastRatio("#ffffff", brand) >= 4.5);
});
