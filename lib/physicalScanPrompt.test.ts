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
test("読めた分だけで itemCount と totalAmount を返し、読めない枚は unreadable として書く指示が入っている", () => {
  assert.ok(PHYSICAL_SCAN_PROMPT.includes("額面が読めた分だけで、itemCountとtotalAmountを必ず出してください"));
  assert.ok(PHYSICAL_SCAN_PROMPT.includes("全体をnullにしないでください"));
  assert.ok(PHYSICAL_SCAN_PROMPT.includes('"unreadable": true'));
});
test("読めない枚があるときに totalAmount を null にする古い指示は残っていない", () => {
  assert.ok(!PHYSICAL_SCAN_PROMPT.includes("額面が読めない枚があるときは、推測せず totalAmount を null にしてください"));
});
test("枚数の上限は AI への指示に入れていない", () => {
  assert.ok(!PHYSICAL_SCAN_PROMPT.includes("100"));
});
