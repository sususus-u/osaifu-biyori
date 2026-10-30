import { test } from "node:test";
import assert from "node:assert/strict";
import { needsOwnSend, relayItem, relayViaHome, SERVICE_PUSH_URL } from "./servicePush.ts";

const item = relayItem({ uid: "u1", stage: "daily", name: "Tポイント", days: 3, accountId: "acc/1" });
const ok = (results: unknown) => async () => ({ status: 200, json: async () => ({ results }) });

test("形", () => {
  assert.deepEqual(item, { uid: "u1", kind: "expiry", name: "Tポイント", days: 3, ref: "acc_1" });
  assert.equal(relayItem({ uid: "u1", stage: "reminder", name: "a", days: 60, accountId: "a" }).kind, "expiry-first");
});

test("合言葉が無ければ、ホームに頼まない(今までどおり FCM)", async () => {
  let called = 0;
  const r = await relayViaHome([item], undefined, async () => {
    called++;
    return { status: 200, json: async () => ({}) };
  });
  assert.deepEqual(r, [null]);
  assert.equal(called, 0);
  assert.equal(needsOwnSend(r[0]), true);
});

test("ホームが断った・失敗したときは、全部を今までどおりに", async () => {
  assert.deepEqual(await relayViaHome([item], "k", async () => ({ status: 503, json: async () => ({}) })), [null]);
  assert.deepEqual(
    await relayViaHome([item], "k", async () => {
      throw new Error("x");
    }),
    [null],
  );
  assert.deepEqual(await relayViaHome([item, item], "k", ok(["sent"])), [null, null]);
});

test("1件ごとの結果: 届けられなかったものだけ、今までの送り方に戻す", async () => {
  const seen: { url: string; key: string; body: string }[] = [];
  const r = await relayViaHome([item, item, item, item, item], "k", async (url, init) => {
    seen.push({ url, key: init.headers["x-push-relay-key"], body: init.body });
    return { status: 200, json: async () => ({ results: ["sent", "off", "no_subscription", "limited", "failed"] }) };
  });
  assert.equal(seen[0].url, SERVICE_PUSH_URL);
  assert.equal(seen[0].key, "k");
  assert.equal(JSON.parse(seen[0].body).service, "tamari-biyori");
  assert.deepEqual(r.map(needsOwnSend), [false, false, true, false, true]);
});
