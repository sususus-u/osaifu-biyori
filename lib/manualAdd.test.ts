import { test } from "node:test";
import assert from "node:assert/strict";
import { manualAdd, type ManualAddDeps, type ManualAddInput } from "./manualAdd.ts";
import type { ExistingItem } from "./stampMerge.ts";

// メモリ上の偽の Firestore。トランザクションは、書き込みをためておき、成功したときだけ反映する。
// retries を指定すると、fn を呼び直す(競合の再実行)。最後の実行の書き込みだけが反映される
function fakeDeps(initial: ExistingItem[], opts: { retries?: number; beforeCommit?: () => void } = {}) {
  const store = new Map(initial.map((i) => [i.id, { ...i }]));
  const history: { id: string; record: Record<string, unknown> }[] = [];
  const deps: ManualAddDeps = {
    now: () => "NOW",
    async runTransaction(fn) {
      let result!: Awaited<ReturnType<typeof fn>>;
      for (let run = 0; run <= (opts.retries ?? 0); run++) {
        const pending: { id: string; fields: Record<string, unknown> }[] = [];
        const pendingHistory: { id: string; record: Record<string, unknown> }[] = [];
        result = await fn({
          async get(id) {
            const v = store.get(id);
            return v ? { ...v } : null;
          },
          update: (id, fields) => void pending.push({ id, fields }),
          addHistory: (id, record) => void pendingHistory.push({ id, record }),
        });
        if (run === (opts.retries ?? 0)) {
          opts.beforeCommit?.();
          for (const p of pending) {
            const cur = store.get(p.id)!;
            store.set(p.id, {
              ...cur,
              currentBalance: p.fields.currentBalance as number,
              itemQuantity: p.fields.itemQuantity as number,
              faceValue: p.fields.faceValue as number,
            });
          }
          history.push(...pendingHistory);
        }
      }
      return result;
    },
  };
  return { deps, store, history };
}

function item(id: string, name: string, over: Partial<ExistingItem> = {}): ExistingItem {
  return { id, name, category: "gift_certificate", faceValue: 1, currentBalance: 18, itemQuantity: 18, createdMillis: 1, ...over };
}

const stampInput: ManualAddInput = {
  id: "a",
  name: "切手 1円",
  category: "gift_certificate",
  addBalance: 5,
  addQuantity: 5,
  faceValue: 1,
  extraFields: {},
  historyExtra: {},
};

test("足し算: 18枚+5枚=23枚。合計金額も足す。履歴の残高と、保存した合計が同じ", async () => {
  const { deps, store, history } = fakeDeps([item("a", "切手 1円")]);
  const r = await manualAdd(deps, stampInput);
  assert.deepEqual(r, { ok: true, newBalance: 23, newQuantity: 23 });
  assert.equal(store.get("a")!.itemQuantity, 23);
  assert.equal(store.get("a")!.currentBalance, 23);
  assert.equal(history.length, 1);
  assert.equal(history[0].record.balance, store.get("a")!.currentBalance);
  assert.equal(history[0].record.source, "manual");
});

test("読んだあとに別の端末が更新していたら、最新の値に足す(20枚+5枚=25枚)", async () => {
  const { deps, store } = fakeDeps([item("a", "切手 1円", { itemQuantity: 20, currentBalance: 20 })]);
  // 画面では 18枚と見えていたが、トランザクションの中で読み直した 20枚 に足す
  const r = await manualAdd(deps, stampInput);
  assert.deepEqual(r, { ok: true, newBalance: 25, newQuantity: 25 });
  assert.equal(store.get("a")!.itemQuantity, 25);
});

test("トランザクションが呼び直されても、二重に足さない・履歴が二重にならない", async () => {
  const { deps, store, history } = fakeDeps([item("a", "切手 1円")], { retries: 2 });
  const r = await manualAdd(deps, stampInput);
  assert.equal(r.ok && r.newQuantity, 23);
  assert.equal(store.get("a")!.itemQuantity, 23);
  assert.equal(history.length, 1);
});

test("条件が合わなくなったら(額面・名前・種類・他人の項目)、足さず、書かない", async () => {
  for (const changed of [
    item("a", "切手 1円", { faceValue: 2 }),
    item("a", "別の名前"),
    item("a", "切手 1円", { category: "electronic_money" }),
  ]) {
    const { deps, store, history } = fakeDeps([changed]);
    const before = JSON.stringify(store.get("a"));
    const r = await manualAdd(deps, stampInput);
    assert.deepEqual(r, { ok: false, reason: "changed" });
    assert.equal(JSON.stringify(store.get("a")), before);
    assert.equal(history.length, 0);
  }
  const none = fakeDeps([]);
  assert.deepEqual(await manualAdd(none.deps, stampInput), { ok: false, reason: "changed" });
});

test("切手以外(ポイントなど): 残高を足す。額面の入力がなければ、額面はそのまま。名前のゆれは同じ名前", async () => {
  const { deps, store } = fakeDeps([
    item("p", "楽天ポイント", { category: "points", faceValue: null, currentBalance: 1000, itemQuantity: null }),
  ]);
  const r = await manualAdd(deps, {
    id: "p",
    name: "楽天　ポイント",
    category: "points",
    addBalance: 500,
    addQuantity: 0,
    faceValue: null,
    extraFields: { yenExchangeRate: null },
    historyExtra: {},
  });
  assert.deepEqual(r, { ok: true, newBalance: 1500, newQuantity: 0 });
  assert.equal(store.get("p")!.currentBalance, 1500);
  assert.equal(store.get("p")!.faceValue, 0);
});

test("切手: 同名で額面の違う項目には、足さない(画面で選んだ項目の額面が変わっていた場合)", async () => {
  const { deps } = fakeDeps([item("a", "切手 1円", { faceValue: 84 })]);
  assert.deepEqual(await manualAdd(deps, stampInput), { ok: false, reason: "changed" });
});
