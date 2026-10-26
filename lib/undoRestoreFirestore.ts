// 「元に戻す」の Firestore 側(依頼232)。中身の作り方は undoRestore.ts。
import { deleteDoc, deleteField, doc, getDoc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { deleteAccounts } from "@/lib/deleteAccount";
import { firestoreDeleteAccountDeps } from "@/lib/deleteAccountFirestore";
import { decodeBefore, pickBefore, type SavedUndo } from "@/lib/undoRestore";

// 書く直前に、その項目の今の値(これから書く項目だけ)を読んでおく
export async function captureBefore(accountId: string, keys: string[]): Promise<Record<string, unknown>> {
  const snap = await getDoc(doc(db, "accounts", accountId));
  return pickBefore(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined, keys);
}

// 元に戻す: 更新は直す前の値を書き戻して、足した履歴を消す。登録は、項目と履歴を消す
export async function runSavedUndo(u: SavedUndo): Promise<void> {
  for (const r of u.restores) {
    const fields = decodeBefore(r.before, (s, ns) => new Timestamp(s, ns), () => deleteField());
    await updateDoc(doc(db, "accounts", r.id), fields);
    for (const updateId of r.updateIds) await deleteDoc(doc(db, "accounts", r.id, "updates", updateId));
  }
  if (u.createIds.length > 0) await deleteAccounts(u.createIds, firestoreDeleteAccountDeps);
}
