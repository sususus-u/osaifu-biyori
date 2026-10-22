// 切手の読み取りの運用ログ(1回の読み取りにつき1行)。
// 出すのは、試行回数、再試行の有無、stop_reason、API エラーの type と status だけ。
// 読み取った内容(name、枚数、金額、内訳)、画像、uid、応答の全文、エラーのメッセージは出さない。
// 調査で詳細が要るときの足し方は、BRAND.md の「切手の読み取りの運用ログ」を見る(足したら、必ず取り消す)。

export const SCAN_LOG_MARK = "[scan-physical-count]";

// stopReasons は試行の順(再試行したら2つ)
export function buildScanLog(
  stopReasons: (string | null | undefined)[],
  retried: boolean,
  skippedBySlow: boolean
): string {
  return [
    SCAN_LOG_MARK,
    `試行=${stopReasons.length}`,
    `再試行=${retried ? "あり" : skippedBySlow ? "なし(1回目が遅い)" : "なし"}`,
    `stop_reason=${stopReasons.map((r) => r ?? "null").join(">")}`,
  ].join(" ");
}

// API のエラー(400 など)。種類(type)と status と、直前の stop_reason だけ
export function buildScanErrorLog(error: unknown, stopReason: string | null | undefined): string {
  const e = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const body = (e.error && typeof e.error === "object" ? e.error : {}) as Record<string, unknown>;
  const inner = (body.error && typeof body.error === "object" ? body.error : {}) as Record<string, unknown>;
  const type = typeof inner.type === "string" ? inner.type : typeof e.name === "string" ? e.name : "不明";
  const status = typeof e.status === "number" ? String(e.status) : "なし";
  return [SCAN_LOG_MARK, "エラー", `type=${type}`, `status=${status}`, `stop_reason=${stopReason ?? "不明"}`].join(" ");
}
