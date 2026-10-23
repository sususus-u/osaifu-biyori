import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_MAX_GROUPS,
  PLAN_LIMITS,
  getPlan,
  isPlanEnforced,
  jstMonthString,
  monthlyAiReadLimit,
  monthlyLimitMessage,
} from "./planLimits.ts";
import { consumeCore, refundCore, type UsageTx } from "./usageCore.ts";

test("プランごとの上限は PLAN_LIMITS から取れる", () => {
  assert.equal(monthlyAiReadLimit("free"), PLAN_LIMITS.free.monthlyAiReads);
  assert.equal(monthlyAiReadLimit("paid1"), PLAN_LIMITS.paid1.monthlyAiReads);
  assert.equal(monthlyAiReadLimit("paid2"), PLAN_LIMITS.paid2.monthlyAiReads);
  assert.deepEqual(
    [PLAN_LIMITS.free.maxRecords, PLAN_LIMITS.paid1.maxRecords, PLAN_LIMITS.paid2.maxRecords, FREE_MAX_GROUPS],
    [30, 100, 500, 3],
  );
  assert.match(monthlyLimitMessage(PLAN_LIMITS.free.monthlyAiReads), /10回/);
});

test("プランは今は常に free", async () => {
  assert.equal(await getPlan("u"), "free");
});

test("月のキーは日本時間の年月(月末と月初の境界)", () => {
  assert.equal(jstMonthString(Date.UTC(2026, 0, 31, 14, 59, 59)), "2026-01");
  assert.equal(jstMonthString(Date.UTC(2026, 0, 31, 15, 0, 0)), "2026-02");
  assert.equal(jstMonthString(Date.UTC(2026, 11, 31, 15, 0, 0)), "2027-01");
});

test("スイッチは ENFORCE_PLAN_LIMITS が true のときだけオン", () => {
  assert.equal(isPlanEnforced(undefined), false);
  assert.equal(isPlanEnforced("false"), false);
  assert.equal(isPlanEnforced("1"), false);
  assert.equal(isPlanEnforced("true"), true);
});

function fakeRun(store: Map<string, number>) {
  return <T>(fn: (tx: UsageTx) => Promise<T>) => {
    const pending = new Map<string, number>();
    const tx: UsageTx = {
      async read(id) {
        return store.get(id) ?? 0;
      },
      write: (id, count) => void pending.set(id, count),
    };
    return fn(tx).then((r) => {
      for (const [k, v] of pending) store.set(k, v);
      return r;
    });
  };
}
const ids = { daily: "u_2026-10-23", monthly: "u_2026-10" };

test("日次と月次の両方を数え、戻すと両方減る", async () => {
  const store = new Map<string, number>();
  const limits = { daily: 20, monthly: 10, enforceMonthly: false };
  assert.equal(await consumeCore(fakeRun(store), ids, limits), "ok");
  assert.equal(store.get(ids.daily), 1);
  assert.equal(store.get(ids.monthly), 1);
  await refundCore(async (id) => void store.set(id, (store.get(id) ?? 0) - 1), ids);
  assert.equal(store.get(ids.daily), 0);
  assert.equal(store.get(ids.monthly), 0);
});

test("日次の上限では、月も増やさず止める(スイッチに関係なく)", async () => {
  const store = new Map([[ids.daily, 20], [ids.monthly, 3]]);
  assert.equal(await consumeCore(fakeRun(store), ids, { daily: 20, monthly: 10, enforceMonthly: false }), "daily");
  assert.equal(store.get(ids.monthly), 3);
});

test("スイッチがオフなら月の上限を超えても止めず、数える", async () => {
  const store = new Map([[ids.daily, 0], [ids.monthly, 10]]);
  assert.equal(await consumeCore(fakeRun(store), ids, { daily: 20, monthly: 10, enforceMonthly: false }), "ok");
  assert.equal(store.get(ids.monthly), 11);
});

test("スイッチがオンなら月の上限で止め、何も増やさない", async () => {
  const store = new Map([[ids.daily, 5], [ids.monthly, 10]]);
  assert.equal(await consumeCore(fakeRun(store), ids, { daily: 20, monthly: 10, enforceMonthly: true }), "monthly");
  assert.equal(store.get(ids.daily), 5);
  assert.equal(store.get(ids.monthly), 10);
});
