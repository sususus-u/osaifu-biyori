import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ITEMS_PER_SCAN,
  MSG_NOTHING_READ,
  MSG_TOO_MANY,
  isNothingRead,
  isOverItemLimit,
  unreadableCount,
  breakdownLines,
  breakdownTotals,
  isBreakdownSuspect,
  MSG_BREAKDOWN_SUSPECT,
  type PhysicalScanResponse,
} from "./physicalScanResult.ts";

const base: PhysicalScanResponse = {
  name: "切手",
  itemCount: 10,
  totalAmount: 840,
  faceValuePerItem: 84,
  expiryDate: null,
};

test("全項目が null のときは「何も読めなかった」になり、案内の文言は撮り直しを促す", () => {
  const allNull = { name: null, itemCount: null, totalAmount: null, faceValuePerItem: null, expiryDate: null };
  assert.equal(isNothingRead(allNull), true);
  assert.equal(
    MSG_NOTHING_READ,
    "写真から切手を読み取れませんでした。明るい場所で、真上から、もう一度撮ってください"
  );
});
test("name だけが null のときは「何も読めなかった」にならない(今の案内のまま)", () => {
  assert.equal(isNothingRead({ ...base, name: null }), false);
});
test("読めた項目が1つでもあれば「何も読めなかった」にならない", () => {
  const r = { name: null, itemCount: null, totalAmount: 840, faceValuePerItem: null, expiryDate: null };
  assert.equal(isNothingRead(r), false);
});
test("枚数が上限ちょうどなら警告しない。超えたら警告する", () => {
  assert.equal(MAX_ITEMS_PER_SCAN, 100);
  assert.equal(isOverItemLimit({ ...base, itemCount: MAX_ITEMS_PER_SCAN }), false);
  assert.equal(isOverItemLimit({ ...base, itemCount: MAX_ITEMS_PER_SCAN + 1 }), true);
  assert.equal(isOverItemLimit({ ...base, itemCount: null }), false);
  assert.ok(MSG_TOO_MANY.includes("枚数が多いようです。分けて撮り直してください"));
});
test("読めなかった枚数は breakdown の unreadable の合計。なければ 0", () => {
  assert.equal(unreadableCount(base), 0);
  assert.equal(
    unreadableCount({
      ...base,
      breakdown: [
        { faceValue: 84, count: 8 },
        { faceValue: null, count: 2, unreadable: true },
        { faceValue: null, count: 1, unreadable: true },
      ],
    }),
    3
  );
});

const stamps: PhysicalScanResponse = {
  name: "切手",
  itemCount: 43,
  totalAmount: 68,
  faceValuePerItem: null,
  expiryDate: null,
  breakdown: [
    { faceValue: 1, count: 18 },
    { faceValue: 2, count: 25 },
  ],
};
test("内訳の整形: 1円×18=18円、2円×25=50円、合計43枚/68円。読めなかった枚は含めない", () => {
  const r = { ...stamps, breakdown: [...stamps.breakdown!, { faceValue: null, count: 3, unreadable: true }] };
  assert.deepEqual(breakdownLines(r), [
    { faceValue: 1, count: 18, subtotal: 18 },
    { faceValue: 2, count: 25, subtotal: 50 },
  ]);
  assert.deepEqual(breakdownTotals(r), { amount: 68, count: 43 });
  assert.equal(unreadableCount(r), 3);
});
test("内訳が null や空なら、行は出ない", () => {
  assert.deepEqual(breakdownLines({ ...stamps, breakdown: null }), []);
  assert.deepEqual(breakdownLines({ ...stamps, breakdown: [] }), []);
  assert.equal(isBreakdownSuspect({ ...stamps, breakdown: [] }), false);
});
test("警告: 1円18枚・2円25枚で totalAmount が 43 のときは警告する", () => {
  assert.equal(isBreakdownSuspect({ ...stamps, totalAmount: 43 }), true);
  assert.ok(MSG_BREAKDOWN_SUSPECT.includes("内訳を確認"));
});
test("警告: 正しい読み取り(68円・43枚)では警告しない", () => {
  assert.equal(isBreakdownSuspect(stamps), false);
});
test("警告: 内訳の枚数の合計が itemCount と違うときは警告する", () => {
  assert.equal(isBreakdownSuspect({ ...stamps, itemCount: 44 }), true);
});
