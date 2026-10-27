// 文字の大きさと濃さの下限(依頼272の追記)の試験。
// 1) 決めた色が、どの地に対しても 4.5:1 以上か。2) globals.css の値と同じか。
// 3) 画面のコードに、12px より小さい文字や、薄い灰色(#999 など)の文字が戻っていないか。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "./stampNameView.ts";
import {
  MIN_TEXT_PX,
  MIN_TEXT_RATIO,
  TEXT_GROUNDS,
  TEXT_MUTED,
  TEXT_WARN,
  blendOver,
  minRatioOnGrounds,
} from "./textContrast.ts";

const root = join(import.meta.dirname, "..");
const css = readFileSync(join(root, "app", "globals.css"), "utf8").replace(/\r\n/g, "\n");

function tsxFiles(dir: string): string[] {
  return (readdirSync(join(root, dir), { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(root, dir, f));
}
const sources = [...tsxFiles("app"), ...tsxFiles("components")].map((f) => ({
  file: f,
  text: readFileSync(f, "utf8"),
}));

const LIGHT_GRAYS = /#(999|999999|888|888888|777|777777|aaa|aaaaaa|bbb|bbbbbb|ccc|cccccc)\b/i;

test("計算の確かめ: 黒と白は 21:1、前の #999 は白に 2.85:1", () => {
  assert.ok(contrastRatio("#000000", "#ffffff") > 20.9);
  assert.equal(contrastRatio("#999999", "#ffffff").toFixed(2), "2.85");
  assert.equal(blendOver("#000000", 0.5, "#ffffff"), "#808080");
});

test("薄い添え書きの色 --text-muted は、どの地にも 4.5:1 以上(いちばん低いのは選んだ行の地)", () => {
  assert.ok(minRatioOnGrounds(TEXT_MUTED) >= MIN_TEXT_RATIO, String(minRatioOnGrounds(TEXT_MUTED)));
  assert.ok(contrastRatio(TEXT_MUTED, TEXT_GROUNDS.white) >= 6.3);
});

test("注意の文字の色 --text-warn は、白と注意の地(#fdf3e7)に 4.5:1 以上。前の #b56a1e は足りない", () => {
  for (const g of [TEXT_GROUNDS.white, TEXT_GROUNDS.overdueRow, TEXT_GROUNDS.band]) {
    assert.ok(contrastRatio(TEXT_WARN, g) >= MIN_TEXT_RATIO);
  }
  assert.ok(contrastRatio("#b56a1e", TEXT_GROUNDS.white) < MIN_TEXT_RATIO);
});

test("前の薄い灰色は、白の地でも 4.5:1 に届かない(戻さないための記録)", () => {
  for (const c of ["#999999", "#888888", "#777777", "#bbbbbb"]) {
    assert.ok(contrastRatio(c, TEXT_GROUNDS.white) < MIN_TEXT_RATIO, c);
  }
});

test("そのまま残した色も、置かれる地に 4.5:1 以上", () => {
  // タブの選んでいない名前(#666 on #f2ece7)、切手の名前の案内(#666 on --brand-surface)、ログアウトの赤、削除の赤
  assert.ok(contrastRatio("#666666", TEXT_GROUNDS.tabTrack) >= MIN_TEXT_RATIO);
  assert.ok(contrastRatio("#666666", TEXT_GROUNDS.brandSurface) >= MIN_TEXT_RATIO);
  assert.ok(contrastRatio("#c0392b", TEXT_GROUNDS.white) >= MIN_TEXT_RATIO);
  assert.ok(minRatioOnGrounds("#b3261e") >= MIN_TEXT_RATIO);
  assert.ok(minRatioOnGrounds("#6e2a32") >= MIN_TEXT_RATIO); // --brand
  assert.ok(contrastRatio("#ffffff", "#6e2a32") >= MIN_TEXT_RATIO); // 小豆色の地の白い文字
});

test("globals.css の --text-muted / --text-warn は、lib/textContrast.ts と同じ値", () => {
  assert.match(css, new RegExp(`--text-muted:\\s*${TEXT_MUTED};`));
  assert.match(css, new RegExp(`--text-warn:\\s*${TEXT_WARN};`));
});

test("globals.css に 12px より小さい文字が無い", () => {
  for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) {
    assert.ok(Number(m[1]) >= MIN_TEXT_PX, m[0]);
  }
});

test("globals.css の薄い灰色の文字は、使えないボタン(:disabled)だけ(上のバーのアイコンも濃くした。依頼273)", () => {
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const color = m[2].match(/(?:^|[;\s])color:\s*([^;]+);/);
    if (!color || !LIGHT_GRAYS.test(color[1])) continue;
    assert.ok(selector.includes(":disabled"), `${selector} { color: ${color[1]} }`);
  }
});

test("上のバーのアイコン(.appbar-home)は --text-muted で、白の地に 3:1 以上(依頼273)", () => {
  const rule = css.slice(css.indexOf(".appbar-home {"), css.indexOf("}", css.indexOf(".appbar-home {")));
  assert.ok(rule.includes("color: var(--text-muted);"));
  assert.ok(contrastRatio("#5f5f5f", "#ffffff") >= 3);
});

test("入力欄の見本の文字(placeholder)は --text-muted で、薄くしない", () => {
  assert.match(css, /input::placeholder,\ntextarea::placeholder \{\n\s*color: var\(--text-muted\);\n\s*opacity: 1;/);
});

test("画面のコードに、12px より小さい文字(fontSize / text-[..px])が無い", () => {
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/fontSize:\s*([\d.]+)\b/g)) {
      assert.ok(Number(m[1]) >= MIN_TEXT_PX, `${file}: ${m[0]}`);
    }
    for (const m of text.matchAll(/text-\[([\d.]+)px\]/g)) {
      assert.ok(Number(m[1]) >= MIN_TEXT_PX, `${file}: ${m[0]}`);
    }
  }
});

test("画面のコードの文字色に、薄い灰色(#999 など)や薄い Tailwind の色が無い", () => {
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/(?<![a-zA-Z])color:\s*([^,}\n]+)/g)) {
      assert.ok(!LIGHT_GRAYS.test(m[1]), `${file}: ${m[0]}`);
    }
    assert.ok(!/text-(gray|slate|stone|neutral|zinc)-(300|400)\b/.test(text), `${file}: 薄い灰色の Tailwind`);
    assert.ok(!/text-(amber|yellow|orange)-(400|500|600)\b/.test(text), `${file}: 薄い注意の色の Tailwind`);
  }
});
