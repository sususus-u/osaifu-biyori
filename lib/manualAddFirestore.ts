// manualAdd の Firestore 側の実装(ブラウザで動く)。ここはテストで動かさない(manualAdd.test.ts は偽の deps を使う)。
import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { ManualAddDeps } from "./manualAdd.ts";
import { toExistingItem } from "./stampMerge.ts";
import type { UndoCapture } from "./undoRestore.ts";

// capture があれば、読んだ値と足した履歴の ID を控える(「元に戻す」用。依頼232)
export function firestoreManualAddDeps(uid: string, capture?: UndoCapture): ManualAddDeps {
  return {
    now: () => serverTimestamp(),
    runTransaction(fn) {
      return runTransaction(db, (t) =>
        fn({
          async get(id) {
            const snap = await t.get(doc(db, "accounts", id));
            if (!snap.exists() || snap.data().ownerId !== uid) return null;
            capture?.onRead(id, snap.data());
            return toExistingItem(snap.id, snap.data());
          },
          update(id, fields) {
            t.update(doc(db, "accounts", id), fields);
          },
          addHistory(id, record) {
            const ref = doc(collection(db, "accounts", id, "updates"));
            capture?.onHistory(id, ref.id);
            t.set(ref, record);
          },
        })
      );
    },
  };
}
