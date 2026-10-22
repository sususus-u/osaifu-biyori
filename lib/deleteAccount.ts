// 項目の削除。履歴(updates サブコレクション)を先に消し、最後に親の項目を消す。
// Firestore は親を消してもサブコレクションを消さないため。履歴の読み込みや削除に失敗したら、親は消さない(やり直せる)。
// 引数は項目の ID の配列(1件でも、複数削除でも使える)。Firestore 側の実装は deleteAccountFirestore.ts

// WriteBatch の書き込み上限は 500 件。余裕を見て 400 件ずつに分ける
export const DELETE_BATCH_SIZE = 400;

export interface DeleteAccountDeps {
  // その項目の履歴(updates)のドキュメント ID をすべて読む
  listUpdateIds(accountId: string): Promise<string[]>;
  // 履歴を1回の書き込みでまとめて消す(全部成功か全部失敗)
  deleteUpdates(accountId: string, updateIds: string[]): Promise<void>;
  // 親の項目を消す
  deleteAccount(accountId: string): Promise<void>;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// 項目ごとに、履歴 → 親の順に消す。途中で失敗したら、その項目の親は消さず、エラーを投げる
// (それまでに消せた項目は消えたまま。呼び出し側は、やり直すと残りだけが対象になる)
export async function deleteAccounts(accountIds: string[], deps: DeleteAccountDeps): Promise<void> {
  for (const id of accountIds) {
    const updateIds = await deps.listUpdateIds(id);
    for (const part of chunk(updateIds, DELETE_BATCH_SIZE)) {
      await deps.deleteUpdates(id, part);
    }
    await deps.deleteAccount(id);
  }
}
