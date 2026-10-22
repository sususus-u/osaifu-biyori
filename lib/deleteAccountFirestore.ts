// deleteAccount の Firestore 側の実装(ブラウザで動く)。ここはテストで動かさない(deleteAccount.test.ts は偽の deps を使う)。
import { collection, deleteDoc, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import type { DeleteAccountDeps } from "./deleteAccount.ts";

export const firestoreDeleteAccountDeps: DeleteAccountDeps = {
  async listUpdateIds(accountId) {
    const snap = await getDocs(collection(db, "accounts", accountId, "updates"));
    return snap.docs.map((d) => d.id);
  },
  async deleteUpdates(accountId, updateIds) {
    const batch = writeBatch(db);
    for (const uid of updateIds) batch.delete(doc(db, "accounts", accountId, "updates", uid));
    await batch.commit();
  },
  async deleteAccount(accountId) {
    await deleteDoc(doc(db, "accounts", accountId));
  },
};
