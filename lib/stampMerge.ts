// 切手を額面ごとの項目で保存するときの「足す/作る」の計画を作る(純粋な関数。ブラウザにも Firestore にも依存しない)。
// 同じ名前(空白と全角数字のゆれは同じとみなす)・種類(gift_certificate)・額面の項目が既にあれば、枚数と合計金額を足す。なければ作る。
// 同じ条件の項目が複数あるときは、いちばん古いものに足す。

export const MAX_STAMP_ROWS = 20; // 1回の保存で扱う行の上限(トランザクションを小さく保つ)
export const MAX_STAMP_NAME_LENGTH = 40;

// 既存の項目(Firestore の accounts の1件から、必要な値だけ取り出したもの)
export interface ExistingItem {
  id: string;
  name: string;
  category: string;
  faceValue: number | null;
  currentBalance: number | null;
  itemQuantity: number | null;
  // 作成日時(ミリ秒)。分からないときは null(古さの比較で最後になる)
  createdMillis: number | null;
}

// 保存する1行(額面ごと)
export interface SaveRow {
  name: string;
  faceValue: number;
  count: number;
}

export type StampPlanItem =
  | {
      kind: "add";
      id: string;
      name: string;
      faceValue: number;
      addCount: number;
      newCount: number;
      newBalance: number;
    }
  | { kind: "create"; name: string; faceValue: number; count: number; amount: number };

const STAMP_NAME = /^切手 \d+円$/;

// 「切手 N円」の形か(額面が1種類のときに、足す動きにするかの判定に使う)
export function isStampName(name: string): boolean {
  return STAMP_NAME.test(name.trim());
}

// 読み取り結果が切手か。AI は、切手の写真の名前を「切手」とする(lib/physicalScanPrompt.ts の指示)ので、
// 名前が「切手」と完全に一致するときだけ切手とみなす(商品券、ギフトカード、図書カードなどは、そのまま)
export function isScannedStamp(aiName: string | null | undefined): boolean {
  return (aiName ?? "").trim() === "切手";
}

// 保存する行の名前。額面が複数、または読み取り結果が切手のときは、行ごとの名前(手で付けた名前、なければ「切手 N円」など)。
// それ以外(額面が1種類の切手以外、または手で名前を変えたもの)は、名前欄の名前そのもの
export function saveRowName(o: {
  rowCount: number;
  name: string;
  scanIsStamp: boolean;
  rowName?: string;
  faceValue: string;
}): string {
  if (o.rowCount === 1 && !o.scanIsStamp) return o.name;
  return o.rowName ?? defaultRowName(isStampName(o.name) || o.scanIsStamp ? "切手" : o.name, o.faceValue);
}

// 行の名前の初期値。額面が整数でなければ空(まだ決められない)
export function defaultRowName(base: string, faceValue: string): string {
  const f = Number(faceValue);
  if (faceValue.trim() === "" || !Number.isInteger(f) || f <= 0) return "";
  return `${base.trim() || "切手"} ${f}円`;
}

// Firestore のドキュメントのデータから、既存の項目を作る。形が違えば null
export function toExistingItem(id: string, data: Record<string, unknown>): ExistingItem | null {
  if (typeof data.name !== "string" || typeof data.category !== "string") return null;
  const created = data.createdAt as { toMillis?: () => number } | null | undefined;
  return {
    id,
    name: data.name,
    category: data.category,
    faceValue: typeof data.faceValue === "number" ? data.faceValue : null,
    currentBalance: typeof data.currentBalance === "number" ? data.currentBalance : null,
    itemQuantity: typeof data.itemQuantity === "number" ? data.itemQuantity : null,
    createdMillis: created && typeof created.toMillis === "function" ? created.toMillis() : null,
  };
}

// 名前を比べるための正規化。空白(全角・半角・タブ・改行など)をすべて除き、全角の数字を半角にする。
// ひらがな・カタカナ・旧字体などのゆれは扱わない。保存する名前には使わない(比べるときだけ)
export function normalizeName(name: string): string {
  return name
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]+/g, "");
}

// 「切手 N円」と同じ名前(空白、全角数字のゆれを除いて)なら、「切手 N円」(半角スペース1つ、半角数字)の形にする。
// それ以外(「記念切手 1円」など)は、そのまま返す。表示と、手動・読み取りの保存で使う(足し算の判定の normalizeName と同じ規則)
export function canonicalStampName(name: string): string {
  const m = /^切手(\d+)円$/.exec(normalizeName(name));
  return m ? `切手 ${m[1]}円` : name;
}

// 画面に出す名前。保存した名前は変えず、表示だけ統一する
export function displayAccountName(name: string): string {
  return canonicalStampName(name);
}

// 同じ名前(空白と全角数字のゆれを除いて)の項目を探す。手で登録するときの同名の確認用。空の名前は見つけない
export function findSameName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const key = normalizeName(name);
  if (key === "") return undefined;
  return items.find((i) => normalizeName(i.name) === key);
}

function matches(item: ExistingItem, row: SaveRow): boolean {
  return (
    item.category === "gift_certificate" &&
    normalizeName(item.name) === normalizeName(row.name) &&
    item.faceValue === row.faceValue
  );
}

// 古い順(作成日時が無いものは最後。同じなら ID の順)
function byOldest(a: ExistingItem, b: ExistingItem): number {
  const am = a.createdMillis ?? Number.POSITIVE_INFINITY;
  const bm = b.createdMillis ?? Number.POSITIVE_INFINITY;
  if (am !== bm) return am < bm ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// 行の確認。問題がなければ null、あれば画面に出す案内
export function validateStampRows(rows: SaveRow[]): string | null {
  if (rows.length === 0) return "額面と枚数を入力してください。";
  if (rows.length > MAX_STAMP_ROWS) return `一度に保存できるのは${MAX_STAMP_ROWS}行までです。分けて保存してください。`;
  for (const r of rows) {
    if (r.name.trim() === "") return "名前を入力してください。";
    if (r.name.length > MAX_STAMP_NAME_LENGTH) return `名前は${MAX_STAMP_NAME_LENGTH}文字以内で入力してください。`;
  }
  return null;
}

// 保存の計画。同じ名前・額面の行は先に1つにまとめる(枚数を足す)。
// 出力の順は、入力で最初に出てきた順
export function planStampSave(existing: ExistingItem[], rows: SaveRow[]): StampPlanItem[] {
  const merged: SaveRow[] = [];
  for (const r of rows) {
    const same = merged.find(
      (m) => normalizeName(m.name) === normalizeName(r.name) && m.faceValue === r.faceValue
    );
    if (same) same.count += r.count;
    else merged.push({ ...r });
  }
  return merged.map((r): StampPlanItem => {
    const target = existing.filter((e) => matches(e, r)).sort(byOldest)[0];
    if (!target) {
      return { kind: "create", name: r.name, faceValue: r.faceValue, count: r.count, amount: r.faceValue * r.count };
    }
    return {
      kind: "add",
      id: target.id,
      name: r.name,
      faceValue: r.faceValue,
      addCount: r.count,
      newCount: (target.itemQuantity ?? 0) + r.count,
      newBalance: (target.currentBalance ?? 0) + r.faceValue * r.count,
    };
  });
}

// 1項目ぶんの案内
export function stampItemText(p: StampPlanItem): string {
  return p.kind === "add"
    ? `${p.name}に${p.addCount}枚追加しました(合計${p.newCount}枚)`
    : `${p.name}を新しく作りました(${p.count}枚)`;
}

// 手で登録する画面で「今回の分を追加する」を押したときの案内の文。
// 切手(「切手 N円」)で枚数を足したら、読み取りの保存と同じ形。それ以外で金額を足したら、足した量と合計(単位つき)。
// 合計は、実際に保存する値(呼ぶ側が渡す)から作る
export function manualAddNotice(o: {
  name: string;
  addQuantity: number;
  newQuantity: number;
  addBalance: number;
  newBalance: number;
  unit: string;
}): string {
  const name = displayAccountName(o.name);
  const yen = (n: number) => `${n.toLocaleString("ja-JP")}${o.unit}`;
  if (isStampName(name) && o.addQuantity > 0) {
    return `${name}に${o.addQuantity}枚追加しました(合計${o.newQuantity}枚)`;
  }
  if (o.addBalance !== 0) return `「${name}」に${yen(o.addBalance)}を追加しました(合計${yen(o.newBalance)})`;
  if (o.addQuantity > 0) return `「${name}」に${o.addQuantity}枚追加しました(合計${o.newQuantity}枚)`;
  return `「${name}」に追加しました`;
}

// 保存後の案内。複数は1行ずつ(改行で区切る)
export function stampSaveMessage(plan: StampPlanItem[]): string {
  return plan.map(stampItemText).join("\n");
}
