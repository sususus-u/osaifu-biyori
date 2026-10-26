// stampSave の Firestore 側の実装(ブラウザで動く)。ここはテストで動かさない(stampSave.test.ts は偽の deps を使う)。
import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { groupNameForNewItem, toExistingItem } from "./stampMerge.ts";
import type { StampSaveDeps } from "./stampSave.ts";
import { guardNewRecords } from "./recordLimitClient";
import type { UndoCapture } from "./undoRestore.ts";

// 足すときに書く項目(「元に戻す」で、直す前の値に戻す項目。依頼232)
export function stampAddKeys(expiry: Timestamp | null): string[] {
  return ["currentBalance", "itemQuantity", ...(expiry ? ["expiryDate"] : []), "lastUpdatedAt", "updatedAt"];
}

// expiry は、利用者が入力したときだけ渡す(切手は基本、期限がない)。足すときは、渡されたときだけ上書きする
export function firestoreStampDeps(uid: string, expiry: Timestamp | null, capture?: UndoCapture): StampSaveDeps {
  return {
    async listMine() {
      // 一覧の画面と同じ、ownerId だけのクエリ(インデックス不要)
      const snap = await getDocs(query(collection(db, "accounts"), where("ownerId", "==", uid)));
      return snap.docs.flatMap((d) => {
        const item = toExistingItem(d.id, d.data());
        return item ? [item] : [];
      });
    },
    checkCreate(creates) {
      return guardNewRecords(
        uid,
        creates.map((c) => ({ groupName: groupNameForNewItem(c.name), category: "gift_certificate" })),
      );
    },
    runTransaction(fn) {
      return runTransaction(db, (t) =>
        fn({
          async get(id) {
            const snap = await t.get(doc(db, "accounts", id));
            if (!snap.exists() || snap.data().ownerId !== uid) return null;
            capture?.onRead(id, snap.data());
            return toExistingItem(snap.id, snap.data());
          },
          addTo(id, newCount, newBalance) {
            const now = serverTimestamp();
            t.update(doc(db, "accounts", id), {
              currentBalance: newBalance,
              itemQuantity: newCount,
              ...(expiry ? { expiryDate: expiry } : {}),
              lastUpdatedAt: now,
              updatedAt: now,
            });
          },
          create(item) {
            const now = serverTimestamp();
            const ref = doc(collection(db, "accounts"));
            t.set(ref, {
              ownerId: uid,
              name: item.name,
              groupName: groupNameForNewItem(item.name),
              category: "gift_certificate",
              isYenBased: true,
              type: "finite",
              currentBalance: item.amount,
              balanceUnit: "円",
              expiryDate: expiry,
              faceValue: item.faceValue,
              itemQuantity: item.count,
              storageLocationMemo: null,
              notificationTiming: { firstStageDays: 90, secondStageDays: 21 },
              lastUpdatedAt: now,
              createdAt: now,
              updatedAt: now,
            });
            return ref.id;
          },
        })
      );
    },
  };
}
