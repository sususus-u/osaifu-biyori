import { test } from "node:test";
import assert from "node:assert/strict";
import { planForNotify, subscriptionFromAdminData } from "./notifyPlan.ts";
import type { LastKnownPlan } from "./plan-resolve.ts";

const now = new Date("2026-11-25T00:00:00Z");
const future = { toDate: () => new Date("2026-12-25T00:00:00Z") };
const snap = (data: Record<string, unknown> | undefined) => async () => ({ exists: data !== undefined, data: () => data });
const memStore = (v: LastKnownPlan | null) => ({ load: async () => v, save: async () => undefined });

test("強制がオフの間は、読まずに無料(みな1つだけ)", async () => {
  let called = 0;
  const plan = await planForNotify({
    uid: "u",
    enforced: false,
    read: async () => {
      called++;
      return { exists: true, data: () => ({ plan: "paid2", status: "active", paidThrough: future }) };
    },
    store: null,
    now,
  });
  assert.equal(plan, "free");
  assert.equal(called, 0);
});

test("強制がオンのときは、記録の中身で決める(plan-resolve.ts の決まり)", async () => {
  assert.equal(
    await planForNotify({ uid: "u", enforced: true, read: snap({ plan: "paid1", status: "active", paidThrough: future }), store: null, now }),
    "paid1",
  );
  // 記録がない(契約したことがない)は無料
  assert.equal(await planForNotify({ uid: "u", enforced: true, read: snap(undefined), store: null, now }), "free");
  // 解約済みは無料
  assert.equal(
    await planForNotify({ uid: "u", enforced: true, read: snap({ plan: "paid1", status: "canceled", paidThrough: future }), store: null, now }),
    "free",
  );
  // おかしい値は無料
  assert.equal(
    await planForNotify({ uid: "u", enforced: true, read: snap({ plan: "gold", status: "active", paidThrough: future }), store: null, now }),
    "free",
  );
});

test("読めないときは、控えを48時間使う。それもなければ無料。例外にしない", async () => {
  const fail = async () => {
    throw new Error("x");
  };
  const recent = { plan: "paid2" as const, confirmedAt: new Date(now.getTime() - 60 * 60 * 1000) };
  const old = { plan: "paid2" as const, confirmedAt: new Date(now.getTime() - 49 * 60 * 60 * 1000) };
  assert.equal(await planForNotify({ uid: "u", enforced: true, read: fail, store: memStore(recent), now }), "paid2");
  assert.equal(await planForNotify({ uid: "u", enforced: true, read: fail, store: memStore(old), now }), "free");
  assert.equal(await planForNotify({ uid: "u", enforced: true, read: fail, store: null, now }), "free");
});

test("Admin SDK の中身の読み替え", () => {
  const r = subscriptionFromAdminData({ plan: "paid1", status: "past_due", paidThrough: future, squareCustomerId: "" });
  assert.equal(r.plan, "paid1");
  assert.equal(r.status, "past_due");
  assert.equal(r.paidThrough?.toISOString(), "2026-12-25T00:00:00.000Z");
  assert.equal(r.squareCustomerId, null);
  assert.deepEqual(
    [subscriptionFromAdminData(undefined).plan, subscriptionFromAdminData(undefined).status],
    ["free", "canceled"],
  );
});
