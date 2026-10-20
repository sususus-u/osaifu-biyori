// 【一時的な診断】切手の読み取りの結果を調べるためのログ文。
// 診断が済んだら、このファイルと、route.ts の呼び出し(「診断」の印の行)を消す。BRAND.md に手順あり。
// 出すのは、型と有無、枚数・金額・内訳の数値、再試行の有無。name は文字数と先頭5文字のみ。応答全体、画像、利用者の情報は出さない。

export const SCAN_DIAGNOSTIC_MARK = "[scan-physical-count 診断]";

function kind(value: unknown): string {
  if (value === null || value === undefined) return "null";
  return typeof value === "number" ? "数値" : typeof value;
}

function num(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "null";
}

// 内訳は「額面×枚数」の数値だけ(最大20行)。読めなかった枚は「不明×枚数」
function breakdownText(value: unknown): string {
  if (!Array.isArray(value)) return "breakdown=null";
  const rows = value.slice(0, 20).map((b) => {
    const r = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    return `${num(r.faceValue) === "null" ? "不明" : num(r.faceValue)}×${num(r.count)}`;
  });
  return `breakdown=${value.length}件(${rows.join("、")})`;
}

// note: 再試行の有無と結果など(例: "試行=1/2 再試行=あり")
export function buildScanDiagnostic(
  parsed: unknown,
  stopReason: string | null | undefined,
  note?: string
): string {
  // parsed が null のときは、JSON として読めなかった応答(stop_reason が max_tokens なら途中で切れた可能性)
  if (parsed === null) {
    return [SCAN_DIAGNOSTIC_MARK, "JSONが読めなかった", `stop_reason=${stopReason ?? "null"}`, ...(note ? [note] : [])].join(" ");
  }
  const p = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const name =
    typeof p.name === "string" ? `文字列(${p.name.length}文字, 先頭5文字「${p.name.slice(0, 5)}」)` : kind(p.name);
  return [
    SCAN_DIAGNOSTIC_MARK,
    `name=${name}`,
    `itemCount=${num(p.itemCount)}`,
    `totalAmount=${num(p.totalAmount)}`,
    `faceValuePerItem=${kind(p.faceValuePerItem)}`,
    breakdownText(p.breakdown),
    `stop_reason=${stopReason ?? "null"}`,
    ...(note ? [note] : []),
  ].join(" ");
}

// API のエラー(400 など)の診断。種類(type)と status、メッセージの先頭だけ(画像、uid、応答の全文は出さない)
export function buildScanErrorDiagnostic(error: unknown, stopReason: string | null | undefined): string {
  const e = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const body = (e.error && typeof e.error === "object" ? e.error : {}) as Record<string, unknown>;
  const inner = (body.error && typeof body.error === "object" ? body.error : {}) as Record<string, unknown>;
  const type = typeof inner.type === "string" ? inner.type : typeof e.name === "string" ? e.name : "不明";
  const status = typeof e.status === "number" ? String(e.status) : "なし";
  const msg = typeof e.message === "string" ? e.message.replace(/s+/g, " ").slice(0, 200) : "";
  return [
    SCAN_DIAGNOSTIC_MARK,
    "応答を読めなかった",
    `type=${type}`,
    `status=${status}`,
    `stop_reason=${stopReason ?? "不明"}`,
    `message=「${msg}」`,
  ].join(" ");
}
