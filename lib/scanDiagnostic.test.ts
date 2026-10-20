import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildScanDiagnostic, buildScanErrorDiagnostic, SCAN_DIAGNOSTIC_MARK } from "./scanDiagnostic.ts";
import { PHYSICAL_SCAN_PROMPT } from "./physicalScanPrompt.ts";

test("診断ログ: name が null / 枚数と金額の数値を出す / 印が先頭", () => {
  const s = buildScanDiagnostic({ name: null, itemCount: 10, totalAmount: 840, faceValuePerItem: null }, "end_turn");
  assert.ok(s.startsWith(SCAN_DIAGNOSTIC_MARK));
  assert.ok(s.includes("name=null") && s.includes("itemCount=10") && s.includes("totalAmount=840"));
  assert.ok(s.includes("faceValuePerItem=null") && s.includes("breakdown=null"));
  assert.ok(s.includes("stop_reason=end_turn"));
});
test("診断ログ: 内訳は「額面×枚数」の数値だけ。再試行の注記が付く", () => {
  const s = buildScanDiagnostic(
    {
      itemCount: 43,
      totalAmount: 68,
      breakdown: [
        { faceValue: 1, count: 18 },
        { faceValue: 2, count: 25 },
        { faceValue: null, count: 3, unreadable: true },
      ],
    },
    "end_turn",
    "試行=2/2 再試行=あり"
  );
  assert.ok(s.includes("breakdown=3件(1×18、2×25、不明×3)"));
  assert.ok(s.includes("試行=2/2 再試行=あり"));
});
test("診断ログ: name が文字列なら、文字数と先頭5文字だけ", () => {
  const s = buildScanDiagnostic({ name: "ABCDEFGHIJ" }, "max_tokens");
  assert.ok(s.includes("10文字") && s.includes("ABCDE") && !s.includes("ABCDEF"));
  assert.ok(s.includes("stop_reason=max_tokens"));
});
test("診断ログ: JSON が読めなかったとき、その旨と stop_reason(max_tokens)と再試行の注記を出す", () => {
  const s = buildScanDiagnostic(null, "max_tokens", "試行=1/2 再試行=あり");
  assert.ok(s.startsWith(SCAN_DIAGNOSTIC_MARK));
  assert.ok(s.includes("JSONが読めなかった") && s.includes("stop_reason=max_tokens") && s.includes("再試行=あり"));
});
test("診断ログ: API エラーは type と status を出し、メッセージは短く切る", () => {
  const err = Object.assign(new Error("x".repeat(500)), {
    status: 400,
    error: { error: { type: "invalid_request_error" } },
  });
  const s = buildScanErrorDiagnostic(err, null);
  assert.ok(s.startsWith(SCAN_DIAGNOSTIC_MARK));
  assert.ok(s.includes("type=invalid_request_error") && s.includes("status=400"));
  assert.ok(s.length < 400);
  assert.ok(buildScanErrorDiagnostic("文字列", "max_tokens").includes("stop_reason=max_tokens"));
});
test("route.ts は、lib の文面をそのまま AI に渡している", () => {
  const route = readFileSync(new URL("../app/api/scan-physical-count/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes('from "@/lib/physicalScanPrompt"'));
  assert.ok(route.includes("text: PHYSICAL_SCAN_PROMPT,"));
  assert.ok(PHYSICAL_SCAN_PROMPT.includes("nameを「切手」とする。"));
});
