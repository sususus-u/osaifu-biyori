// 現物の読み取り結果(/api/scan-physical-count の応答)を見て、画面に出す案内を決める。
// 画面(ScanPhysicalUpload)から切り出したのは、AI を呼ばずにテストできるようにするため。

// 1回の読み取りで扱う枚数の目安。枚数が多いと数え間違いやすいため、超えたら警告を出す(登録は止めない)。
// 精度を見ながら、ここだけ変えて調整する。AI への指示には入れない(上限を超える写真で、数えなくなるおそれがあるため)。
export const MAX_ITEMS_PER_SCAN = 100;

export const MSG_NOTHING_READ =
  "写真から切手を読み取れませんでした。明るい場所で、真上から、もう一度撮ってください";
export const MSG_TOO_MANY = `枚数が多いようです。分けて撮り直してください（1回あたり${MAX_ITEMS_PER_SCAN}枚までを目安にしています）`;

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

export interface BreakdownLine {
  faceValue: number;
  count: number;
  subtotal: number;
}

// 画面に出す内訳(額面と枚数が読めた行だけ。AI の返した順)
export function breakdownLines(r: PhysicalScanResponse): BreakdownLine[] {
  if (!Array.isArray(r.breakdown)) return [];
  const out: BreakdownLine[] = [];
  for (const b of r.breakdown) {
    if (!b || b.unreadable) continue;
    if (typeof b.faceValue !== "number" || typeof b.count !== "number") continue;
    out.push({ faceValue: b.faceValue, count: b.count, subtotal: b.faceValue * b.count });
  }
  return out;
}

// 内訳の合計(読めた行の、額面×枚数の和と、枚数の和)
export function breakdownTotals(r: PhysicalScanResponse): { amount: number; count: number } {
  const lines = breakdownLines(r);
  return {
    amount: lines.reduce((s, l) => s + l.subtotal, 0),
    count: lines.reduce((s, l) => s + l.count, 0),
  };
}

export const MSG_BREAKDOWN_SUSPECT = "額面が正しく読めていない可能性があります。内訳を確認してください";

// 額面が読み違えられた疑いがあるか(登録は止めない)。
// (1) totalAmount が itemCount と同じで、内訳の合計と違う (2) 内訳の枚数の合計が itemCount と違う
export function isBreakdownSuspect(r: PhysicalScanResponse): boolean {
  if (breakdownLines(r).length === 0) return false;
  const t = breakdownTotals(r);
  if (typeof r.itemCount !== "number") return false;
  if (typeof r.totalAmount === "number" && r.totalAmount === r.itemCount && t.amount !== r.totalAmount) return true;
  return t.count !== r.itemCount;
}

// ---- 入力画面の「額面ごとの行」 ----

// 1行の入力(入力欄の文字列のまま持つ)
export interface ScanRow {
  faceValue: string;
  count: string;
  // 手で付けた項目名(複数の額面のとき)。なければ、名前と額面から決まる(defaultRowName)
  name?: string;
}

export const MAX_FACE_VALUE = 1_000_000; // 額面(1枚あたり)の上限(円)
export const MAX_ROW_COUNT = 10_000; // 1行の枚数の上限

// 読み取り結果から、行の初期値を作る。
// breakdown に読めた行があればそれ(同じ額面は枚数を足す)。なければ、今までどおり 1行(額面 faceValuePerItem × 枚数 itemCount)
export function initialRows(r: PhysicalScanResponse): ScanRow[] {
  const lines = breakdownLines(r);
  if (lines.length > 0) {
    const merged: BreakdownLine[] = [];
    for (const l of lines) {
      const same = merged.find((m) => m.faceValue === l.faceValue);
      if (same) {
        same.count += l.count;
        same.subtotal += l.subtotal;
      } else {
        merged.push({ ...l });
      }
    }
    return merged.map((l) => ({ faceValue: String(l.faceValue), count: String(l.count) }));
  }
  return [
    {
      faceValue: r.faceValuePerItem != null ? String(r.faceValuePerItem) : "",
      count: r.itemCount != null ? String(r.itemCount) : "",
    },
  ];
}

// 行から合計を計算する。数として読めない欄は 0 として数える
export function rowsTotals(rows: ScanRow[]): { amount: number; count: number } {
  let amount = 0;
  let count = 0;
  for (const row of rows) {
    const f = Number(row.faceValue);
    const c = Number(row.count);
    const fv = row.faceValue.trim() !== "" && Number.isFinite(f) ? f : 0;
    const cv = row.count.trim() !== "" && Number.isFinite(c) ? c : 0;
    amount += fv * cv;
    count += cv;
  }
  return { amount, count };
}

export function addRow(rows: ScanRow[]): ScanRow[] {
  return [...rows, { faceValue: "", count: "" }];
}

// 行を消す。最後の1行は消さない(空にしない)
export function removeRow(rows: ScanRow[], index: number): ScanRow[] {
  if (rows.length <= 1 || index < 0 || index >= rows.length) return rows;
  return rows.filter((_, i) => i !== index);
}

export function updateRow(rows: ScanRow[], index: number, patch: Partial<ScanRow>): ScanRow[] {
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
}

// 行の確認。問題がなければ null、あれば画面に出す案内
export function validateRows(rows: ScanRow[]): string | null {
  for (const row of rows) {
    if (row.faceValue.trim() === "" || row.count.trim() === "") return "額面と枚数を入力してください。";
    const f = Number(row.faceValue);
    const c = Number(row.count);
    if (!Number.isInteger(f) || !Number.isInteger(c) || f <= 0 || c <= 0) {
      return "額面と枚数は、1以上の整数で入力してください。";
    }
    if (f > MAX_FACE_VALUE) return `額面は${MAX_FACE_VALUE.toLocaleString()}円以下で入力してください。`;
    if (c > MAX_ROW_COUNT) return `枚数は1行あたり${MAX_ROW_COUNT.toLocaleString()}枚以下で入力してください。`;
  }
  return null;
}
