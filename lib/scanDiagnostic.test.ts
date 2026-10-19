import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildScanDiagnostic, SCAN_DIAGNOSTIC_MARK } from "./scanDiagnostic.ts";
import { PHYSICAL_SCAN_PROMPT } from "./physicalScanPrompt.ts";

test("診断ログ: name が null / 数値は出さない / 印が先頭", () => {
  const s = buildScanDiagnostic({ name: null, itemCount: 10, totalAmount: 840, faceValuePerItem: null }, "end_turn");
  assert.ok(s.startsWith(SCAN_DIAGNOSTIC_MARK));
  assert.ok(s.includes("name=null") && s.includes("itemCount=数値") && s.includes("faceValuePerItem=null"));
  assert.ok(s.includes("stop_reason=end_turn"));
  assert.ok(!s.includes("840"));
});
test("診断ログ: name が文字列なら、文字数と先頭5文字だけ", () => {
  const s = buildScanDiagnostic({ name: "ABCDEFGHIJ" }, "max_tokens");
  assert.ok(s.includes("10文字") && s.includes("ABCDE") && !s.includes("ABCDEF"));
  assert.ok(s.includes("stop_reason=max_tokens"));
});
test("route.ts は、lib の文面をそのまま AI に渡している", () => {
  const route = readFileSync(new URL("../app/api/scan-physical-count/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes('from "@/lib/physicalScanPrompt"'));
  assert.ok(route.includes("text: PHYSICAL_SCAN_PROMPT,"));
  assert.ok(PHYSICAL_SCAN_PROMPT.includes("nameを「切手」とする。"));
});
