// プランを決める部品の写し(lib/plan-resolve.ts。正本はハブ)のテスト(依頼287)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readPlanWithIdToken, resolvePlan, subscriptionDocUrl } from "./plan-resolve.ts";

const COPY_PATH = new URL("./plan-resolve.ts", import.meta.url);
const versionOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

test("写しを手で直していない(頭の「写しの中身の版」と、中身が合う)", () => {
  const text = readFileSync(COPY_PATH, "utf8").replace(/\r\n/g, "\n");
  const m = /^\/\/ 正本の版: ([0-9a-f]{16}) \/ 写しの中身の版: ([0-9a-f]{16})$/m.exec(text);
  assert.ok(m, "写しの頭に、版の行がない");
  const body = text.split("\n").slice(3).join("\n");
  assert.equal(versionOf(body), m[2], "写しが正本と違う。ハブで node scripts/plan-resolve-copy.mjs を実行して写し直す");
});

const NOW = new Date("2026-10-28T12:00:00Z");

test("記録が読めないとき、控えがなければ無料", () => {
  assert.equal(resolvePlan({ read: { ok: false }, lastKnown: null, now: NOW }).plan, "free");
});

test("ルールの公開の前(403)は、無料。エラーにしない", async () => {
  const fetch403 = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
  const plan = await readPlanWithIdToken({
    uid: "u", idToken: "t", enforced: true, fetchImpl: fetch403, store: null, now: NOW,
  });
  assert.equal(plan, "free");
});

test("強制がオフのときは、記録を読まない", async () => {
  let called = false;
  const fetchSpy = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(
    await readPlanWithIdToken({ uid: "u", idToken: "t", enforced: false, fetchImpl: fetchSpy, store: null, now: NOW }),
    "free",
  );
  assert.equal(called, false);
});

test("読む先は、共用のプロジェクトの subscriptions/{uid}", () => {
  assert.match(subscriptionDocUrl("u"), /\/projects\/okizukibiyori\/databases\/\(default\)\/documents\/subscriptions\/u$/);
});
