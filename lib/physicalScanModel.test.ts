import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_PHYSICAL_SCAN_MODELS,
  DEFAULT_PHYSICAL_SCAN_MODEL,
  resolvePhysicalScanModel,
} from "./physicalScanModel.ts";

test("モデル: 未設定・空は既定(警告なし)", () => {
  assert.deepEqual(resolvePhysicalScanModel(undefined), { model: DEFAULT_PHYSICAL_SCAN_MODEL, warning: null });
  assert.equal(resolvePhysicalScanModel("  ").model, DEFAULT_PHYSICAL_SCAN_MODEL);
});
test("モデル: 許可の一覧にある値はそのまま使う", () => {
  assert.equal(resolvePhysicalScanModel("claude-sonnet-5-5").model, "claude-sonnet-5-5");
  assert.ok(ALLOWED_PHYSICAL_SCAN_MODELS.includes(DEFAULT_PHYSICAL_SCAN_MODEL));
});
test("モデル: 一覧にない値は既定にして警告する(任意の文字列を渡さない)", () => {
  const r = resolvePhysicalScanModel("gpt-4; rm -rf " + "x".repeat(100));
  assert.equal(r.model, DEFAULT_PHYSICAL_SCAN_MODEL);
  assert.ok(r.warning && r.warning.length < 150);
});
