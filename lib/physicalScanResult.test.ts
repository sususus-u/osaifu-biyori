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
  initialRows,
  rowsTotals,
  addRow,
  removeRow,
  updateRow,
  validateRows,
  MAX_FACE_VALUE,
  MAX_ROW_COUNT,
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

test("行の初期値: breakdown から額面ごとの行になる(1円×18、2円×25)", () => {
  assert.deepEqual(initialRows(stamps), [
    { faceValue: "1", count: "18" },
    { faceValue: "2", count: "25" },
  ]);
});
test("行の初期値: 同じ額面の行は枚数を足す。読めなかった枚は入れない", () => {
  const r = {
    ...stamps,
    breakdown: [
      { faceValue: 1, count: 10 },
      { faceValue: 1, count: 8 },
      { faceValue: null, count: 3, unreadable: true },
    ],
  };
  assert.deepEqual(initialRows(r), [{ faceValue: "1", count: "18" }]);
});
test("行の初期値: breakdown が無い・空なら、今までどおり1行(faceValuePerItem × itemCount)", () => {
  const one = { name: "切手", itemCount: 10, totalAmount: 840, faceValuePerItem: 84, expiryDate: null };
  assert.deepEqual(initialRows(one), [{ faceValue: "84", count: "10" }]);
  assert.deepEqual(initialRows({ ...one, breakdown: [] }), [{ faceValue: "84", count: "10" }]);
  assert.deepEqual(initialRows({ ...one, faceValuePerItem: null, itemCount: null }), [{ faceValue: "", count: "" }]);
});
test("行から合計を計算する(18円+50円=68円、43枚)。空の欄は 0", () => {
  assert.deepEqual(rowsTotals(initialRows(stamps)), { amount: 68, count: 43 });
  assert.deepEqual(rowsTotals([{ faceValue: "", count: "5" }, { faceValue: "2", count: "x" }]), { amount: 0, count: 5 });
});
test("行の追加・削除・修正。最後の1行は消えない", () => {
  let rows = initialRows(stamps);
  rows = addRow(rows);
  assert.equal(rows.length, 3);
  rows = updateRow(rows, 2, { faceValue: "10", count: "3" });
  assert.deepEqual(rowsTotals(rows), { amount: 98, count: 46 });
  rows = removeRow(rows, 0);
  assert.deepEqual(rows[0], { faceValue: "2", count: "25" });
  assert.equal(removeRow([{ faceValue: "1", count: "1" }], 0).length, 1);
  assert.equal(removeRow(rows, 9).length, rows.length);
});
test("数値の確認: 整数で 0 より大きく、上限以内", () => {
  assert.equal(validateRows(initialRows(stamps)), null);
  assert.ok(validateRows([{ faceValue: "", count: "3" }]));
  assert.ok(validateRows([{ faceValue: "1.5", count: "3" }]));
  assert.ok(validateRows([{ faceValue: "0", count: "3" }]));
  assert.ok(validateRows([{ faceValue: "1", count: "-2" }]));
  assert.ok(validateRows([{ faceValue: String(MAX_FACE_VALUE + 1), count: "1" }]));
  assert.ok(validateRows([{ faceValue: "1", count: String(MAX_ROW_COUNT + 1) }]));
  assert.equal(validateRows([{ faceValue: String(MAX_FACE_VALUE), count: String(MAX_ROW_COUNT) }]), null);
});
