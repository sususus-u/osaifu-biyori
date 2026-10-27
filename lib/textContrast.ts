// 文字の大きさと濃さの下限(依頼272の追記)。
// 読む文字は 12px 以上、置かれる地に対して WCAG のコントラスト比 4.5:1 以上。
// 色の値は app/globals.css の --text-muted / --text-warn と同じ(試験で突き合わせる)。
import { contrastRatio } from "./stampNameView.ts";

export const MIN_TEXT_PX = 12;
export const MIN_TEXT_RATIO = 4.5;

// 薄い添え書き(件数、日時、タブの名前、注、読み込み中など)。前は #999 / #888 / #777
export const TEXT_MUTED = "#5f5f5f";
// 読み取りに自信がないときの注意の文字と、その枠のボタン。前は #b56a1e
export const TEXT_WARN = "#9a5516";

// 文字が置かれる地(このサービスには暗い表示が無いので、明るい表示だけ)
export const TEXT_GROUNDS: Record<string, string> = {
  white: "#ffffff",
  band: "#faf8f6", // 一覧の見出しの帯
  tabTrack: "#f2ece7", // 「期間限定」などのタブの地
  selectedRow: "#efd5cc", // 選んだ行
  overdueRow: "#fdf3e7", // 期限切れのまま更新していない行・自信のない欄
  brandSurface: "#f7f1ec", // --brand-surface(切手の名前の地)
  softNote: "#fef8f5", // 案内の枠
};

// 透明度のある文字色を、地の色に混ぜた色(#rrggbb)。opacity の付いた文字の比を出すときに使う
export function blendOver(fg: string, alpha: number, bg: string): string {
  const p = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const f = p(fg);
  const b = p(bg);
  return (
    "#" +
    f
      .map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)))
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

// いちばん低い地での比
export function minRatioOnGrounds(fg: string, grounds: string[] = Object.values(TEXT_GROUNDS)): number {
  return Math.min(...grounds.map((g) => contrastRatio(fg, g)));
}
