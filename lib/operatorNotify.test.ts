import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOperatorNotifyRequest, notifyOperator, OPERATOR_NOTIFY_URL } from "./operatorNotify.ts";

test("中身は、ホームの窓口あてに、種類だけを送る", () => {
  const r = buildOperatorNotifyRequest("ai-budget-limit", "k");
  assert.ok(r);
  assert.equal(r.url, "https://okizukibiyori.com/api/operator-notify");
  assert.equal(r.init.method, "POST");
  assert.deepEqual(r.init.headers, { "content-type": "application/json", "x-dashboard-key": "k" });
  assert.equal(r.init.body, '{"service":"tamari-biyori","kind":"ai-budget-limit"}');
  assert.equal(buildOperatorNotifyRequest("ai-daily-limit", "k")?.init.body, '{"service":"tamari-biyori","kind":"ai-daily-limit"}');
});

test("鍵がなければ送らない", async () => {
  assert.equal(buildOperatorNotifyRequest("ai-budget-limit", undefined), null);
  assert.equal(buildOperatorNotifyRequest("ai-budget-limit", ""), null);
  let called = false;
  const ok = await notifyOperator("ai-budget-limit", {
    key: undefined,
    fetchImpl: (async () => {
      called = true;
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });
  assert.equal(ok, false);
  assert.equal(called, false);
});

test("200 なら true、ほかの応答(401・404・429・503)は false で、例外を投げない", async () => {
  for (const [status, want] of [[200, true], [401, false], [404, false], [429, false], [503, false], [400, false]] as const) {
    let url = "";
    const ok = await notifyOperator("ai-daily-limit", {
      key: "k",
      fetchImpl: (async (u: string) => {
        url = u;
        return new Response(null, { status });
      }) as unknown as typeof fetch,
    });
    assert.equal(ok, want);
    assert.equal(url, OPERATOR_NOTIFY_URL);
  }
});

test("fetch が失敗しても、例外を投げない", async () => {
  const ok = await notifyOperator("ai-budget-limit", {
    key: "k",
    fetchImpl: (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch,
  });
  assert.equal(ok, false);
});

test("ホームが応答しなくても、決まった時間で待つのをやめる", async () => {
  const start = Date.now();
  const ok = await notifyOperator("ai-budget-limit", {
    key: "k",
    timeoutMs: 50,
    fetchImpl: (() => new Promise(() => {})) as typeof fetch,
  });
  assert.equal(ok, false);
  assert.ok(Date.now() - start < 1000);
});

test("2つの窓口と全員の合計の上限で、ホームの窓口を呼ぶ。自分で端末へ送る処理と回数の記録は使わない", () => {
  for (const route of ["scan-account", "scan-physical-count"]) {
    const src = readFileSync(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(src, /await notifyOperator\("ai-budget-limit"\);/);
  }
  const usage = readFileSync(new URL("./usageLimit.ts", import.meta.url), "utf8");
  assert.match(usage, /await notifyOperator\("ai-daily-limit"\);/);
  const self = readFileSync(new URL("./operatorNotify.ts", import.meta.url), "utf8");
  assert.ok(!/ADMIN_UID|fcmTokens|notify_counts_tamari|sendEachForMulticast/.test(self.replace(/^\/\/.*$/gm, "")));
  assert.ok(!/【運営者向け】/.test(self.replace(/^\/\/.*$/gm, "")));
});
