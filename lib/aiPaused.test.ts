import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSpendLimitError, aiPausedBody, aiPausedLog, AI_PAUSED_LOG_MARK } from "./aiPaused.ts";
import { readScanJson } from "./scanImage.ts";

const spendLimit = {
  status: 400,
  error: {
    type: "error",
    error: {
      type: "invalid_request_error",
      message: "You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.",
    },
  },
  message: "400 You have reached your specified API usage limits.",
};

test("利用額の上限とクレジットの残高切れは、上限による断りと見る", () => {
  assert.equal(isSpendLimitError(spendLimit), true);
  assert.equal(
    isSpendLimitError({
      status: 400,
      error: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } },
    }),
    true
  );
});

test("ほかの失敗は、上限による断りと見ない(画面の文は今のまま)", () => {
  assert.equal(isSpendLimitError({ status: 400, error: { error: { type: "invalid_request_error", message: "image: too large" } } }), false);
  assert.equal(isSpendLimitError({ status: 429, error: { error: { type: "rate_limit_error", message: "rate limit" } } }), false);
  assert.equal(isSpendLimitError({ status: 529, error: { error: { type: "overloaded_error", message: "Overloaded" } } }), false);
  assert.equal(isSpendLimitError(new Error("AIの応答をJSONとして読めなかった")), false);
  assert.equal(isSpendLimitError(null), false);
});

test("画面には、手入力で登録できることを含む文が、そのまま出る", async () => {
  const res = new Response(JSON.stringify(aiPausedBody()), { status: 503 });
  await assert.rejects(() => readScanJson(res), { message: "ただいま AI の読み取りを休んでいます。手入力で登録できます。" });
  assert.equal(aiPausedBody().code, "ai_paused");
});

test("ログは決まった印で始まる1行", () => {
  const s = aiPausedLog("scan-account");
  assert.ok(s.startsWith(`${AI_PAUSED_LOG_MARK} osaifu-biyori scan-account`));
  assert.ok(!s.includes("\n"));
});

test("2つの窓口は、上限のときだけ 503 と印を返し、運営者に知らせ、ほかは今までどおり", () => {
  for (const route of ["scan-account", "scan-physical-count"]) {
    const src = readFileSync(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(src, new RegExp(`if \\(isSpendLimitError\\(error\\)\\) \\{\\s+console\\.error\\(aiPausedLog\\("${route}"\\)\\);\\s+await notifyAdmin\\(ADMIN_AI_PAUSED\\);\\s+return NextResponse\\.json\\(aiPausedBody\\(\\), \\{ status: 503 \\}\\);`));
    assert.match(src, /return NextResponse\.json\(\{ error: "読み取りに失敗しました" \}, \{ status: 500 \}\);/);
  }
});
