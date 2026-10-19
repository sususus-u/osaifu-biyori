// 【一時的な診断】切手の読み取りで name が null になる原因を調べるためのログ文。
// 診断が済んだら、このファイルと、route.ts の呼び出し(「診断」の印の行)を消す。BRAND.md に手順あり。
// 出すのは、型と有無だけ。name は文字数と先頭5文字のみ。数値、応答全体、画像、利用者の情報は出さない。

export const SCAN_DIAGNOSTIC_MARK = "[scan-physical-count 診断]";

function kind(value: unknown): string {
  if (value === null || value === undefined) return "null";
  return typeof value === "number" ? "数値" : typeof value;
}

export function buildScanDiagnostic(parsed: unknown, stopReason: string | null | undefined): string {
  const p = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const name =
    typeof p.name === "string" ? `文字列(${p.name.length}文字, 先頭5文字「${p.name.slice(0, 5)}」)` : kind(p.name);
  return [
    SCAN_DIAGNOSTIC_MARK,
    `name=${name}`,
    `itemCount=${kind(p.itemCount)}`,
    `totalAmount=${kind(p.totalAmount)}`,
    `faceValuePerItem=${kind(p.faceValuePerItem)}`,
    `stop_reason=${stopReason ?? "null"}`,
  ].join(" ");
}
