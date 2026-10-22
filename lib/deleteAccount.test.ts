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
