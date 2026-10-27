import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteAccounts, DELETE_BATCH_SIZE, type DeleteAccountDeps } from "./deleteAccount.ts";

// 呼ばれた順番を記録する偽の deps
function fake(updateCount: Record<string, number>, failOn?: "list" | "updates" | "account") {
  const calls: string[] = [];
  const batchSizes: number[] = [];
  const deps: DeleteAccountDeps = {
    async listUpdateIds(id) {
      calls.push(`list:${id}`);
      if (failOn === "list") throw new Error("list failed");
      return Array.from({ length: updateCount[id] ?? 0 }, (_, i) => `u${i}`);
    },
    async deleteUpdates(id, ids) {
      calls.push(`updates:${id}`);
      batchSizes.push(ids.length);
      if (failOn === "updates") throw new Error("batch failed");
    },
    async deleteAccount(id) {
      calls.push(`account:${id}`);
      if (failOn === "account") throw new Error("account failed");
    },
  };
  return { deps, calls, batchSizes };
}

test("履歴が0件: 削除のバッチは作らず、親だけ消す", async () => {
  const f = fake({ a: 0 });
  await deleteAccounts(["a"], f.deps);
  assert.deepEqual(f.calls, ["list:a", "account:a"]);
});

test("履歴が1件: 1回のバッチで消し、親は最後", async () => {
  const f = fake({ a: 1 });
  await deleteAccounts(["a"], f.deps);
  assert.deepEqual(f.calls, ["list:a", "updates:a", "account:a"]);
  assert.deepEqual(f.batchSizes, [1]);
});

test("履歴が401件: 400件と1件に分けて消し、親は最後", async () => {
  const f = fake({ a: 401 });
  await deleteAccounts(["a"], f.deps);
  assert.equal(DELETE_BATCH_SIZE, 400);
  assert.deepEqual(f.batchSizes, [400, 1]);
  assert.equal(f.calls[f.calls.length - 1], "account:a");
});

test("履歴の削除に失敗したら、親は消さずにエラー", async () => {
  const f = fake({ a: 3 }, "updates");
  await assert.rejects(deleteAccounts(["a"], f.deps), /batch failed/);
  assert.ok(!f.calls.includes("account:a"));
});

test("履歴の読み込みに失敗したら、親は消さずにエラー", async () => {
  const f = fake({ a: 3 }, "list");
  await assert.rejects(deleteAccounts(["a"], f.deps), /list failed/);
  assert.deepEqual(f.calls, ["list:a"]);
});

test("複数の項目: 項目ごとに 履歴→親 の順。失敗した項目で止まり、後の項目は触らない", async () => {
  const ok = fake({ a: 1, b: 1 });
  await deleteAccounts(["a", "b"], ok.deps);
  assert.deepEqual(ok.calls, ["list:a", "updates:a", "account:a", "list:b", "updates:b", "account:b"]);
  const ng = fake({ a: 1, b: 1 }, "updates");
  await assert.rejects(deleteAccounts(["a", "b"], ng.deps));
  assert.deepEqual(ng.calls, ["list:a", "updates:a"]);
});

// ---- 複数削除 ----
import { deleteSelectedAccounts, DeleteTooLargeError, DELETE_MAX_ACCOUNTS, buildDeleteConfirm, errorKind, type BulkDeleteDeps, type DeleteEntry } from "./deleteAccount.ts";

// 偽の Firestore: store に残っている項目と履歴。deleteBatch は、成功したときだけ全部反映する(失敗なら何も消えない)
function fakeBulk(updateCount: Record<string, number>, opts: { failBatch?: boolean; failList?: boolean } = {}) {
  const parents = new Set(Object.keys(updateCount));
  const updates = new Map(Object.entries(updateCount).map(([k, n]) => [k, n]));
  const batches: DeleteEntry[][] = [];
  const deps: BulkDeleteDeps = {
    async listUpdateIds(id) {
      if (opts.failList) throw new Error("list failed");
      return Array.from({ length: updates.get(id) ?? 0 }, (_, i) => `u${i}`);
    },
    async deleteUpdates(id, ids) {
      updates.set(id, (updates.get(id) ?? 0) - ids.length);
    },
    async deleteAccount(id) {
      parents.delete(id);
    },
    async deleteBatch(entries) {
      batches.push(entries);
      if (opts.failBatch) throw new Error("batch failed");
      for (const e of entries) {
        updates.set(e.accountId, 0);
        parents.delete(e.accountId);
      }
    },
  };
  return { deps, parents, updates, batches };
}

test("複数削除: 履歴も親も 1 回のバッチで消す", async () => {
  const f = fakeBulk({ a: 2, b: 0, c: 3 });
  await deleteSelectedAccounts(["a", "b", "c"], f.deps);
  assert.equal(f.batches.length, 1);
  assert.equal(f.parents.size, 0);
  assert.deepEqual(f.batches[0].map((e) => e.updateIds.length), [2, 0, 3]);
});

test("複数削除: バッチが失敗したら、何も消えない(全部失敗)", async () => {
  const f = fakeBulk({ a: 2, b: 1 }, { failBatch: true });
  await assert.rejects(deleteSelectedAccounts(["a", "b"], f.deps), /batch failed/);
  assert.equal(f.parents.size, 2);
  assert.equal(f.updates.get("a"), 2);
});

test("複数削除: 履歴の読み込みに失敗したら、何も消えない", async () => {
  const f = fakeBulk({ a: 1, b: 1 }, { failList: true });
  await assert.rejects(deleteSelectedAccounts(["a", "b"], f.deps), /list failed/);
  assert.equal(f.parents.size, 2);
  assert.equal(f.batches.length, 0);
});

test("複数削除: 書き込みが400件を超えるときは、何も消さずに DeleteTooLargeError", async () => {
  const f = fakeBulk({ a: 200, b: 199 }); // 200+1+199+1 = 401
  await assert.rejects(deleteSelectedAccounts(["a", "b"], f.deps), DeleteTooLargeError);
  assert.equal(f.parents.size, 2);
  assert.equal(f.batches.length, 0);
  const ok = fakeBulk({ a: 200, b: 198 }); // ちょうど 400
  await deleteSelectedAccounts(["a", "b"], ok.deps);
  assert.equal(ok.parents.size, 0);
});

test("複数削除: 50件まで。51件は何も読まず、何も消さずにエラー", async () => {
  const many = Object.fromEntries(Array.from({ length: DELETE_MAX_ACCOUNTS + 1 }, (_, i) => [`x${i}`, 0]));
  const f = fakeBulk(many);
  await assert.rejects(deleteSelectedAccounts(Object.keys(many), f.deps));
  assert.equal(f.parents.size, DELETE_MAX_ACCOUNTS + 1);
  const fifty = fakeBulk(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`y${i}`, 0])));
  await deleteSelectedAccounts([...fifty.updates.keys()], fifty.deps);
  assert.equal(fifty.parents.size, 0);
});

test("複数削除: 1件だけのときは deleteAccounts(履歴→親)を使い、0件は何もしない", async () => {
  const f = fakeBulk({ a: 2 });
  await deleteSelectedAccounts(["a"], f.deps);
  assert.equal(f.batches.length, 0);
  assert.equal(f.parents.size, 0);
  await deleteSelectedAccounts([], f.deps);
});

test("確認の文: 名前は5件まで。超えたら「ほかN件」。注意の文", () => {
  const three = buildDeleteConfirm(["A", "B", "C"]);
  assert.equal(three.title, "3件を削除しますか？");
  assert.deepEqual(three.shown, ["A", "B", "C"]);
  assert.equal(three.restText, "");
  assert.equal(three.confirmLabel, "3件を削除する");
  assert.equal(three.note, "元に戻せません。履歴も一緒に消えます。");
  const eight = buildDeleteConfirm(["1", "2", "3", "4", "5", "6", "7", "8"]);
  assert.deepEqual(eight.shown, ["1", "2", "3", "4", "5"]);
  assert.equal(eight.restText, "ほか3件");
  assert.equal(buildDeleteConfirm(["1", "2", "3", "4", "5"]).restText, "");
});

test("失敗の種類: code か name だけ。メッセージは含めない", () => {
  assert.equal(errorKind(Object.assign(new Error("秘密"), { code: "permission-denied" })), "permission-denied");
  assert.equal(errorKind(new DeleteTooLargeError()), "DeleteTooLargeError");
  assert.equal(errorKind(null), "unknown");
});

import { afterBulkDelete, failureMessage, DELETE_FAILED_MESSAGE } from "./deleteAccount.ts";
test("成功後: 確認を閉じ、モードを抜け、選択は空、トーストに件数", () => {
  const r = afterBulkDelete(3);
  assert.equal(r.confirmOpen, false);
  assert.equal(r.selectMode, false);
  assert.equal(r.selected.size, 0);
  assert.equal(r.toast, "3件を削除しました");
});
test("失敗の文: 通常は「削除に失敗しました…」。大きすぎるときは、何も削除していないと伝える", () => {
  assert.equal(failureMessage(new Error("x")), DELETE_FAILED_MESSAGE);
  assert.ok(failureMessage(new DeleteTooLargeError()).includes("何も削除していません"));
});
