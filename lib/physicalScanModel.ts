// 切手の読み取り(/api/scan-physical-count)で使うモデルの選択。
// 環境変数 SCAN_PHYSICAL_MODEL で切り替える。許可した名前だけを使い、任意の文字列は API に渡さない。

export const DEFAULT_PHYSICAL_SCAN_MODEL = "claude-haiku-4-5-20251001";

export const ALLOWED_PHYSICAL_SCAN_MODELS: readonly string[] = [
  "claude-haiku-4-5-20251001",
  "claude-haiku-4-5",
  "claude-sonnet-5-5",
];

// 未設定なら既定。一覧にない値も既定にして、warning に理由を返す(値そのものは長さを限って出す)
export function resolvePhysicalScanModel(raw: string | undefined): { model: string; warning: string | null } {
  const v = (raw ?? "").trim();
  if (v === "") return { model: DEFAULT_PHYSICAL_SCAN_MODEL, warning: null };
  if (ALLOWED_PHYSICAL_SCAN_MODELS.includes(v)) return { model: v, warning: null };
  return {
    model: DEFAULT_PHYSICAL_SCAN_MODEL,
    warning: `SCAN_PHYSICAL_MODEL「${v.slice(0, 40)}」は許可の一覧にないため、既定のモデルを使います`,
  };
}
