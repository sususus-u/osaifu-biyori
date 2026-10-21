// 手動の登録で、グループ名が「切手」のとき、種類・単位・期限を自動で入れる(入力作業を省く)ための、純粋な計算。
// 手で変えた欄(touched)は優先して上書きしない。グループ名を「切手」から変えたら、手で変えていない欄だけ元に戻す。
// 通知は、期限がなければ対象外(送る処理が、期限日のない項目を飛ばす)ので、値は変えない(既存の項目と同じ 90/21 日のまま)。

export interface StampAutoState {
  category: string;
  unit: string;
  hasExpiry: boolean | null; // null は未選択
}

export interface StampTouched {
  category: boolean;
  unit: boolean;
  expiry: boolean;
}

export const NO_TOUCH: StampTouched = { category: false, unit: false, expiry: false };

export const STAMP_AUTO_CATEGORY = "gift_certificate"; // 商品券・切手
export const STAMP_AUTO_UNIT = "円";

// 切手として自動で入れる値(手で変えた欄は、今の値のまま)
export function stampAutoApply(cur: StampAutoState, touched: StampTouched): StampAutoState {
  return {
    category: touched.category ? cur.category : STAMP_AUTO_CATEGORY,
    unit: touched.unit ? cur.unit : STAMP_AUTO_UNIT,
    hasExpiry: touched.expiry ? cur.hasExpiry : false,
  };
}

// 「切手」でなくなったとき。手で変えていない欄だけ、入れる前の値(prev)に戻す
export function stampAutoRestore(cur: StampAutoState, prev: StampAutoState, touched: StampTouched): StampAutoState {
  return {
    category: touched.category ? cur.category : prev.category,
    unit: touched.unit ? cur.unit : prev.unit,
    hasExpiry: touched.expiry ? cur.hasExpiry : prev.hasExpiry,
  };
}

// 画面に見せる一言。今の値が、自動で入れた値のままの欄だけを挙げる。切手の入力でなければ null
export function stampAutoSummary(o: {
  isStampEntry: boolean;
  cur: StampAutoState;
  touched: StampTouched;
}): string | null {
  if (!o.isStampEntry) return null;
  const parts: string[] = [];
  if (!o.touched.category && o.cur.category === STAMP_AUTO_CATEGORY) parts.push("種類=商品券・切手");
  if (!o.touched.unit && o.cur.unit === STAMP_AUTO_UNIT) parts.push("単位=円");
  if (!o.touched.expiry && o.cur.hasExpiry === false) parts.push("期限=なし", "通知=なし");
  if (parts.length === 0) return null;
  return `自動で設定しました: ${parts.join("、")}(変更できます)`;
}
