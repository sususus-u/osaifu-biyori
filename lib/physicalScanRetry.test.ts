import { test } from "node:test";
import assert from "node:assert/strict";
import { RETRY_SKIP_AFTER_MS, needsRetry, readWithRetry, type ScanAttempt } from "./physicalScanRetry.ts";
import { MSG_NOTHING_READ, isNothingRead } from "./physicalScanResult.ts";

const nothing: ScanAttempt = {
  parsed: { name: null, itemCount: null, totalAmount: null, faceValuePerItem: null, expiryDate: null },
  stopReason: "end_turn",
};
const cut: ScanAttempt = { parsed: null, stopReason: "max_tokens", parseFailed: true };
const ok: ScanAttempt = {
  parsed: { name: "切手", itemCount: 43, totalAmount: 68, faceValuePerItem: null, expiryDate: null },
  stopReason: "end_turn",
};

function fake(results: (ScanAttempt | Error)[]) {
  let calls = 0;
  return {
    calls: () => calls,
    fn: async () => {
      const r = results[calls++];
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

test("成功したら再試行しない(AI は1回だけ)", async () => {
  const f = fake([ok, ok]);
  const r = await readWithRetry(f.fn);
  assert.equal(f.calls(), 1);
  assert.equal(r.retried, false);
});
test("全項目 null なら1回だけ再試行し、成功すればその結果を返す", async () => {
  const f = fake([nothing, ok]);
  const r = await readWithRetry(f.fn);
  assert.equal(f.calls(), 2);
  assert.equal(r.retried, true);
  assert.equal(r.attempts[r.attempts.length - 1].parsed?.totalAmount, 68);
});
test("再試行しても null なら、最後の結果は「何も読めなかった」(今までの案内)で、3回目は呼ばない", async () => {
  const f = fake([nothing, nothing, ok]);
  const r = await readWithRetry(f.fn);
  assert.equal(f.calls(), 2);
  assert.equal(isNothingRead(r.attempts[r.attempts.length - 1].parsed!), true);
  assert.ok(MSG_NOTHING_READ.length > 0);
});
test("再試行が失敗しても、1回目の結果を返す(エラーにしない)", async () => {
  const f = fake([nothing, new Error("boom")]);
  const r = await readWithRetry(f.fn);
  assert.equal(r.attempts.length, 1);
  assert.equal(isNothingRead(r.attempts[0].parsed!), true);
});
test("1回目が遅いときは再試行しない", async () => {
  const f = fake([nothing, ok]);
  let t = 0;
  const now = () => (t += RETRY_SKIP_AFTER_MS + 1);
  const r = await readWithRetry(f.fn, now);
  assert.equal(f.calls(), 1);
  assert.equal(r.skippedBySlow, true);
});
test("利用回数は route の guardAiRead の1回だけ(再試行のたびに数えない)", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../app/api/scan-physical-count/route.ts", import.meta.url), "utf8");
  assert.equal(route.split("guardAiRead(").length - 1, 1);
  assert.ok(route.includes("readWithRetry(callAi)"));
});
test("JSON が途中で切れたとき、1回だけ再試行し、読めれば成功を返す", async () => {
  const f = fake([cut, ok]);
  const r = await readWithRetry(f.fn);
  assert.equal(f.calls(), 2);
  assert.equal(r.attempts[1].parsed?.totalAmount, 68);
  assert.equal(needsRetry(r.attempts[1]), false);
});
test("再試行でも JSON が読めなければ、最後は parsed=null(route は今までの失敗の案内を返す)。3回目は呼ばない", async () => {
  const f = fake([cut, cut, ok]);
  const r = await readWithRetry(f.fn);
  assert.equal(f.calls(), 2);
  assert.equal(r.attempts[r.attempts.length - 1].parsed, null);
});
test("全項目 null の後に JSON が読めなくても、合計で1回まで(逆の順も同じ)", async () => {
  const a = fake([nothing, cut, ok]);
  await readWithRetry(a.fn);
  assert.equal(a.calls(), 2);
  const b = fake([cut, nothing, ok]);
  await readWithRetry(b.fn);
  assert.equal(b.calls(), 2);
});
test("JSON が切れて1回目が遅いときは再試行しない", async () => {
  const f = fake([cut, ok]);
  let t = 0;
  const r = await readWithRetry(f.fn, () => (t += RETRY_SKIP_AFTER_MS + 1));
  assert.equal(f.calls(), 1);
  assert.equal(r.skippedBySlow, true);
});
test("route: max_tokens は定数 1000、thinking は付けない、JSON が読めない応答は再試行の対象", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../app/api/scan-physical-count/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes("const SCAN_MAX_TOKENS = 1000;"));
  assert.ok(route.includes("max_tokens: SCAN_MAX_TOKENS"));
  assert.ok(!route.includes("thinking")); // Sonnet 5.5 は disabled を受け付けず 400 になった。付けない
  assert.ok(route.includes("parseFailed: true"));
});
