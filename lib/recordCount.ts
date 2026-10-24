// 項目(レコード)の数え方。純粋な関数(Firestore にも画面にも依存しない)。
// 保存された1件ずつを1件と数える。ただし、切手(グループ名が「切手」で、種類が gift_certificate)は、
// 額面がいくつあっても、切手全体で1件。切手が0件なら0。規則は stampMerge.ts の切手の判定(isStampLikeEntry)と同じ。
import { STAMP_DEFAULT_NAME } from "./stampMerge.ts";

// 数えるのに必要な値だけ
export interface CountItem {
  groupName: string | null;
  category: string;
}

export function isStampRecord(i: CountItem): boolean {
  return i.category === "gift_certificate" && (i.groupName ?? "").trim() === STAMP_DEFAULT_NAME;
}

// Firestore のドキュメントのデータから作る。形が違っても、1件として数える(数え漏れで上限をすり抜けないため)
export function toCountItem(data: Record<string, unknown>): CountItem {
  return {
    groupName: typeof data.groupName === "string" ? data.groupName : null,
    category: typeof data.category === "string" ? data.category : "",
  };
}

export function countRecords(items: CountItem[]): number {
  const stamps = items.filter(isStampRecord).length;
  return items.length - stamps + (stamps > 0 ? 1 : 0);
}

// 今の項目に、これから作る項目を足したとき、増える件数。
// 切手は、すでに切手があれば0、なければ1(いくつ作っても1)。ほかは、作る数
export function newRecordCount(existing: CountItem[], planned: CountItem[]): number {
  return countRecords([...existing, ...planned]) - countRecords(existing);
}
