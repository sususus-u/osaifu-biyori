// 「置き換える」を押したときの確認の説明文。既存の項目の値と、置き換えたあとの値を比べて、変わるものだけを文にする(純粋な関数)。
// 元の値が残らない操作なので、押す前に前後の値を見せる。

export interface ReplaceValues {
  balance: number | null; // 残高
  expiry: string | null; // 期限(YYYY-MM-DD)。なければ null
  faceValue: number | null; // 額面
  quantity: number | null; // 枚数
}

function num(n: number | null, suffix: string): string {
  return n === null ? "なし" : `${n.toLocaleString("ja-JP")}${suffix}`;
}

// 変わる項目だけ、「残高: 1,000円 → 2,500円」の形で返す。何も変わらなければ空
export function replaceChanges(before: ReplaceValues, after: ReplaceValues, unit: string): string[] {
  const lines: string[] = [];
  if (before.balance !== after.balance) lines.push(`残高: ${num(before.balance, unit)} → ${num(after.balance, unit)}`);
  if (before.expiry !== after.expiry) lines.push(`期限: ${before.expiry ?? "なし"} → ${after.expiry ?? "なし"}`);
  if (before.faceValue !== after.faceValue) lines.push(`額面: ${num(before.faceValue, "円")} → ${num(after.faceValue, "円")}`);
  if (before.quantity !== after.quantity) lines.push(`枚数: ${num(before.quantity, "枚")} → ${num(after.quantity, "枚")}`);
  return lines;
}

export const REPLACE_WARNING = "元の値は戻せません。";
export const REPLACE_NO_CHANGE = "変わる項目はありません。";
