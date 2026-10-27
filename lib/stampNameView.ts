// 数字入力で自動で決まる名前(「切手 84円」)の見せ方。文字色・背景色と、その読みやすさ(WCAG のコントラスト比)。
// 額面を入れたあとの名前は濃い文字色(打ち込む欄ではなく、自動で決まった値だと分かるよう、薄い背景に載せる)。
// 額面を入れる前の案内は、薄めの色のまま。どちらも WCAG AA(通常の文字 4.5:1)以上。
export const STAMP_NAME_BG = "#f7f1ec"; // --brand-surface と同じ
export const STAMP_NAME_COLOR = "#222222"; // 決まった名前(濃い)
export const STAMP_NAME_HINT_COLOR = "#666666"; // 額面を入れる前の案内(薄め)

export interface StampNameView {
  text: string; // 名前として見せる文字
  hint: string; // 続ける案内(決まったあとは空)
  textColor: string;
  hintColor: string;
  background: string;
}

export function stampNameView(name: string, defaultName: string): StampNameView {
  const decided = name !== "";
  return {
    text: decided ? name : defaultName,
    hint: decided ? "" : "（額面を入れると「切手 ○円」になります）",
    textColor: decided ? STAMP_NAME_COLOR : STAMP_NAME_HINT_COLOR,
    hintColor: STAMP_NAME_HINT_COLOR,
    background: STAMP_NAME_BG,
  };
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

// WCAG のコントラスト比(#rrggbb 同士)
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
