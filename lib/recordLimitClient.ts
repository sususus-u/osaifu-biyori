// 画面側の、保存前の件数の確認(ブラウザで動く。テストでは動かさない)。
// 1) 増える件数を数える(lib/recordCount.ts)。0なら、ハブに問い合わせない(足す・編集・残高の更新はここ)。
//    切手を作るときだけ、すでに切手があるかを1件だけ読んで調べる(読み取り1回)。
// 2) 自分のサーバーの中継(/api/records-check)経由で、ハブに問い合わせる(lib/hubRecordCheck.ts)。
// 止めるときは、ハブが返した案内の文をそのまま返す。許可のときは null。
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { authFetch } from "./authFetch";
import { checkCreate } from "./hubRecordCheck.ts";
import { isStampRecord, newRecordCount, type CountItem } from "./recordCount.ts";
import { STAMP_DEFAULT_NAME } from "./stampMerge.ts";

async function userHasStamp(uid: string): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(db, "accounts"),
      where("ownerId", "==", uid),
      where("groupName", "==", STAMP_DEFAULT_NAME),
      where("category", "==", "gift_certificate"),
      limit(1),
    ),
  );
  return !snap.empty;
}

export async function guardNewRecords(uid: string, planned: CountItem[]): Promise<string | null> {
  if (planned.length === 0) return null;
  try {
    const hasStamp = planned.some(isStampRecord) ? await userHasStamp(uid) : false;
    const adding = newRecordCount(hasStamp, planned);
    const r = await checkCreate(adding, (n, signal) =>
      authFetch("/api/records-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adding: n }),
        signal,
      }),
    );
    return r.ok ? null : r.message;
  } catch {
    // 切手の有無が読めなかったとき。利用者を止めない
    console.error("records-check: lookup-failed");
    return null;
  }
}
