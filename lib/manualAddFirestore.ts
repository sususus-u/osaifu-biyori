// manualAdd の Firestore 側の実装(ブラウザで動く)。ここはテストで動かさない(manualAdd.test.ts は偽の deps を使う)。
import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { ManualAddDeps } from "./manualAdd.ts";
import { toExistingItem } from "./stampMerge.ts";

export function firestoreManualAddDeps(uid: string): ManualAddDeps {
  return {
    now: () => serverTimestamp(),
    runTransaction(fn) {
      return runTransaction(db, (t) =>
        fn({
          async get(id) {
            const snap = await t.get(doc(db, "accounts", id));
            if (!snap.exists() || snap.data().ownerId !== uid) return null;
            return toExistingItem(snap.id, snap.data());
          },
          update(id, fields) {
            t.update(doc(db, "accounts", id), fields);
          },
          addHistory(id, record) {
            t.set(doc(collection(db, "accounts", id, "updates")), record);
          },
        })
      );
    },
  };
}
