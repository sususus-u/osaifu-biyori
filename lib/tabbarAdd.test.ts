// 下のメニューの「+ 登録」を丸に(依頼273の追記。3つのサービス共通)の試験。
// 丸は直径48px、地はブランドの色、メニューの中(上へはみ出さない)、「登録」の字は丸の中、白い字との比は 4.5:1 以上。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "./stampNameView.ts";

const root = join(import.meta.dirname, "..");
const css = readFileSync(join(root, "app", "globals.css"), "utf8").replace(/\r\n/g, "\n");
const shell = readFileSync(join(root, "components", "AppShell.tsx"), "utf8").replace(/\r\n/g, "\n");

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

test("丸は直径48px、まんまる、地はブランドの色、白い縁なし、影は 0 1px 4px rgba(0,0,0,0.2)", () => {
  const r = rule(".tabbar-add-circle");
  assert.match(r, /width:\s*48px/);
  assert.match(r, /height:\s*48px/);
  assert.match(r, /border-radius:\s*50%/);
  assert.match(r, /background:\s*var\(--brand\)/);
  assert.match(r, /box-shadow:\s*0 1px 4px rgba\(0, 0, 0, 0\.2\)/);
  assert.doesNotMatch(r, /border:/);
  assert.match(r, /gap:\s*1px/);
});

test("丸はメニューの中: 上へずらす指定(負の margin、translate、top)がない。メニューの高さ78pxと下の余白はそのまま", () => {
  const all = [".tabbar-add-circle", ".tabbar-add,\n.tabbar-add.active", ".tabbar-add-label"].map(rule).join("\n");
  assert.doesNotMatch(all, /margin[^;]*-\d/);
  assert.doesNotMatch(all, /translate/);
  assert.doesNotMatch(all, /(^|\s)top:/);
  assert.doesNotMatch(all, /position:\s*absolute/);
  const bar = rule(".tabbar");
  assert.match(bar, /height:\s*78px/);
  assert.match(bar, /padding-bottom:\s*max\(14px, env\(safe-area-inset-bottom\)\)/);
});

test("「登録」の字は丸の中(12px、太字、行の高さ1)。丸の下に別の字を置かない", () => {
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
  assert.match(shell, /className=\{`tabbar-item tabbar-add /);
  assert.match(shell, /href: "\/accounts\/new"/);
  assert.match(rule(".tabbar-item"), /flex:\s*1/);
  assert.match(rule(".tabbar-add:focus-visible .tabbar-add-circle"), /outline:\s*2px solid/);
});

test("白い字とブランドの色の比は 4.5:1 以上(--brand 10.29:1、開いている間の --brand-dark 12.75:1)", () => {
  const brand = token("--brand");
  const dark = token("--brand-dark");
  assert.equal(contrastRatio("#ffffff", brand).toFixed(2), "10.29");
  assert.equal(contrastRatio("#ffffff", dark).toFixed(2), "12.75");
  assert.ok(contrastRatio("#ffffff", brand) >= 4.5);
  assert.ok(contrastRatio("#ffffff", dark) >= 4.5);
});
