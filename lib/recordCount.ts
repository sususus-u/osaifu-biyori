// 保存で「増える件数」の数え方。純粋な関数(Firestore にも画面にも依存しない)。
// 件数の合計と上限の判断は、ハブ(/api/records/check)がする。ここは、増える件数だけを出す。
// 保存された1件ずつを1件と数える。ただし、切手(グループ名が「切手」で、種類が gift_certificate)は、
// 額面がいくつあっても、切手全体で1件。規則は stampMerge.ts の切手の判定(isStampLikeEntry)と同じ。
import { STAMP_DEFAULT_NAME } from "./stampMerge.ts";

// 数えるのに必要な値だけ
export interface CountItem {
  groupName: string | null;
  category: string;
}

export function isStampRecord(i: CountItem): boolean {
  return i.category === "gift_certificate" && (i.groupName ?? "").trim() === STAMP_DEFAULT_NAME;
}

// これから作る項目で、増える件数。切手は、すでに切手があれば0、なければ1(いくつ作っても1)。ほかは、作る数
export function newRecordCount(hasStamp: boolean, planned: CountItem[]): number {
  const stamps = planned.filter(isStampRecord).length;
  return planned.length - stamps + (stamps > 0 && !hasStamp ? 1 : 0);
}
