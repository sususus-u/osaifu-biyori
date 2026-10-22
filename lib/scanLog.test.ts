import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildScanLog, buildScanErrorLog, SCAN_LOG_MARK } from "./scanLog.ts";
import { PHYSICAL_SCAN_PROMPT } from "./physicalScanPrompt.ts";

test("運用ログ: 1回で済んだ。印が先頭、1行、試行・再試行・stop_reason だけ", () => {
  const s = buildScanLog(["end_turn"], false, false);
  assert.equal(s, `${SCAN_LOG_MARK} 試行=1 再試行=なし stop_reason=end_turn`);
  assert.ok(!s.includes("\n"));
});
test("運用ログ: 再試行したときは、試行=2 と stop_reason が順に並ぶ", () => {
  assert.equal(buildScanLog(["max_tokens", "end_turn"], true, false), `${SCAN_LOG_MARK} 試行=2 再試行=あり stop_reason=max_tokens>end_turn`);
});
test("運用ログ: 1回目が遅くて再試行しなかった / stop_reason が無いとき", () => {
  const s = buildScanLog([null], false, true);
  assert.ok(s.includes("再試行=なし(1回目が遅い)") && s.includes("stop_reason=null"));
});
test("運用ログ: API エラーは type と status と stop_reason だけ。メッセージは出さない", () => {
  const err = Object.assign(new Error("秘密のメッセージ"), {
    status: 400,
    error: { error: { type: "invalid_request_error" } },
  });
  const s = buildScanErrorLog(err, null);
  assert.equal(s, `${SCAN_LOG_MARK} エラー type=invalid_request_error status=400 stop_reason=不明`);
  assert.ok(!s.includes("秘密"));
  assert.ok(buildScanErrorLog("文字列", "max_tokens").includes("stop_reason=max_tokens"));
});
test("route.ts は、lib の文面をそのまま AI に渡している", () => {
  const route = readFileSync(new URL("../app/api/scan-physical-count/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes('from "@/lib/physicalScanPrompt"'));
  assert.ok(route.includes("text: PHYSICAL_SCAN_PROMPT,"));
  assert.ok(PHYSICAL_SCAN_PROMPT.includes("nameを「切手」とする。"));
});
