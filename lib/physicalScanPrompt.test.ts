import { test } from "node:test";
import assert from "node:assert/strict";
import { PHYSICAL_SCAN_PROMPT } from "./physicalScanPrompt.ts";

test("切手のとき name を「切手」とする1文が入っている", () => {
  assert.ok(
    PHYSICAL_SCAN_PROMPT.includes(
      "切手の場合(切手の絵柄、額面、シートの形から切手と判断できる場合)は、名前が印刷されていなくても、nameを「切手」とする。"
    )
  );
});
test("切手以外の name の指示(自信がなければ null)は残っている", () => {
  assert.ok(PHYSICAL_SCAN_PROMPT.includes("判読に自信が持てない場合は、無理に推測せず、必ずnullを返してください"));
});
test("出力の形(breakdown と name)が残っている", () => {
  assert.ok(PHYSICAL_SCAN_PROMPT.includes('"breakdown"'));
  assert.ok(PHYSICAL_SCAN_PROMPT.includes('"name"'));
});
