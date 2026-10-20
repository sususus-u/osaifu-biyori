// 現物の読み取り結果(/api/scan-physical-count の応答)を見て、画面に出す案内を決める。
// 画面(ScanPhysicalUpload)から切り出したのは、AI を呼ばずにテストできるようにするため。

// 1回の読み取りで扱う枚数の目安。枚数が多いと数え間違いやすいため、超えたら警告を出す(登録は止めない)。
// 精度を見ながら、ここだけ変えて調整する。AI への指示には入れない(上限を超える写真で、数えなくなるおそれがあるため)。
export const MAX_ITEMS_PER_SCAN = 100;

export const MSG_NOTHING_READ =
  "写真から切手を読み取れませんでした。明るい場所で、真上から、もう一度撮ってください";
export const MSG_TOO_MANY = `枚数が多いようです。分けて撮り直してください(1回あたり${MAX_ITEMS_PER_SCAN}枚までを目安にしています)`;

export interface PhysicalScanResponse {
  name: string | null;
  itemCount: number | null;
  totalAmount: number | null;
  faceValuePerItem: number | null;
  expiryDate: string | null;
  breakdown?: { faceValue: number | null; count: number | null; unreadable?: boolean }[] | null;
}

// 何も読めなかった(全項目が null)か
export function isNothingRead(r: PhysicalScanResponse): boolean {
  return (
    r.name == null &&
    r.itemCount == null &&
    r.totalAmount == null &&
    r.faceValuePerItem == null &&
    r.expiryDate == null
  );
}

// 枚数が目安を超えているか(登録は止めず、警告だけ出す)
export function isOverItemLimit(r: PhysicalScanResponse): boolean {
  return typeof r.itemCount === "number" && r.itemCount > MAX_ITEMS_PER_SCAN;
}

// 額面が読めなかった枚数(breakdown の unreadable の合計)。なければ 0
export function unreadableCount(r: PhysicalScanResponse): number {
  if (!Array.isArray(r.breakdown)) return 0;
  return r.breakdown.reduce(
    (sum, b) => (b && b.unreadable && typeof b.count === "number" ? sum + b.count : sum),
    0
  );
}
