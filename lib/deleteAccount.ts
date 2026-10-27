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

// ---- 複数の項目をまとめて削除(一覧の選択モード)----
// 設計: 全項目の履歴を先に読み、「全項目の履歴 + 全項目の親」を 1 回の WriteBatch で消す(全部成功か全部失敗)。
// 書き込みが DELETE_BATCH_SIZE(400)を超える(履歴が多い)ときは、何も消さずに DeleteTooLargeError にする
// (分けて消すと、途中で失敗したとき、一部の項目だけ消えるため)。
// 1件だけのときは、上の deleteAccounts(履歴が多くても分けて消す。親は最後)を使う。

// 一度に削除できる項目の数(一覧の選択の上限 SELECTION_LIMIT と同じ)
export const DELETE_MAX_ACCOUNTS = 50;

export class DeleteTooLargeError extends Error {
  constructor() {
    super("履歴が多く、一度に削除できない");
    this.name = "DeleteTooLargeError";
  }
}

export interface DeleteEntry {
  accountId: string;
  updateIds: string[];
}

export interface BulkDeleteDeps extends DeleteAccountDeps {
  // 全項目の履歴と親を、1回の書き込み(全部成功か全部失敗)で消す
  deleteBatch(entries: DeleteEntry[]): Promise<void>;
}

export async function deleteSelectedAccounts(accountIds: string[], deps: BulkDeleteDeps): Promise<void> {
  if (accountIds.length === 0) return;
  // 念のための確認。超えたら、何も読まず、何も消さない
  if (accountIds.length > DELETE_MAX_ACCOUNTS) throw new Error("一度に削除できる件数を超えている");
  if (accountIds.length === 1) return deleteAccounts(accountIds, deps);
  const entries: DeleteEntry[] = await Promise.all(
    accountIds.map(async (accountId) => ({ accountId, updateIds: await deps.listUpdateIds(accountId) }))
  );
  const writes = entries.reduce((sum, e) => sum + e.updateIds.length + 1, 0);
  if (writes > DELETE_BATCH_SIZE) throw new DeleteTooLargeError();
  await deps.deleteBatch(entries);
}

// 失敗の種類だけ(項目名、uid、メッセージは含めない)。ログ用
export function errorKind(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; name?: unknown };
    if (typeof e.code === "string") return e.code;
    if (typeof e.name === "string") return e.name;
  }
  return "unknown";
}

// 確認シートの文。名前は最初の 5 件まで、残りは「ほかN件」
export const DELETE_CONFIRM_NAMES = 5;
export function buildDeleteConfirm(names: string[]) {
  const shown = names.slice(0, DELETE_CONFIRM_NAMES);
  const rest = names.length - shown.length;
  return {
    title: `${names.length}件を削除しますか？`,
    shown,
    rest,
    restText: rest > 0 ? `ほか${rest}件` : "",
    note: "元に戻せません。履歴も一緒に消えます。",
    confirmLabel: `${names.length}件を削除する`,
  };
}

export const DELETE_FAILED_MESSAGE = "削除に失敗しました。もう一度お試しください。";
export const DELETE_TOO_LARGE_MESSAGE = "履歴が多く、一度に削除できません。選ぶ件数を減らしてください（何も削除していません）";

// 成功したあとの画面の状態: 確認を閉じ、選択モードを抜け(選択は空)、上部のトーストを出す
export function afterBulkDelete(count: number) {
  return { confirmOpen: false, selectMode: false, selected: new Set<string>(), toast: `${count}件を削除しました` };
}

// 失敗したときに画面に出す文(原因の詳細は出さない)
export function failureMessage(error: unknown): string {
  return error instanceof DeleteTooLargeError ? DELETE_TOO_LARGE_MESSAGE : DELETE_FAILED_MESSAGE;
}
