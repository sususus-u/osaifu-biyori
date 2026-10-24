import { test } from "node:test";
import assert from "node:assert/strict";
import { countRecords, newRecordCount, isStampRecord, toCountItem, type CountItem } from "./recordCount.ts";
import { checkRecordLimit, recordLimitMessage, RecordLimitError } from "./recordLimit.ts";
import { PLAN_LIMITS } from "./planLimits.ts";
import { saveStamps, type StampSaveDeps } from "./stampSave.ts";

const gift = (groupName: string | null): CountItem => ({ groupName, category: "gift_certificate" });
const other = (n = 1): CountItem[] => Array.from({ length: n }, () => ({ groupName: null, category: "point" }));
const stamps = (n: number): CountItem[] => Array.from({ length: n }, () => gift("切手"));

test("数え方: 切手は全部まとめて1件。0件なら0。ほかは1件ずつ", () => {
  assert.equal(countRecords([]), 0);
  assert.equal(countRecords(stamps(1)), 1);
  assert.equal(countRecords(stamps(5)), 1);
  assert.equal(countRecords([...stamps(3), ...other(2)]), 3);
  assert.equal(countRecords(other(4)), 4);
});

test("数え方: グループ名が「切手」でも種類が違えば切手ではない。ほかのグループは1件ずつ", () => {
  assert.equal(isStampRecord({ groupName: "切手", category: "point" }), false);
  assert.equal(isStampRecord(gift(" 切手 ")), true);
  assert.equal(countRecords([gift("図書カード"), gift("図書カード"), gift(null)]), 3);
  assert.deepEqual(toCountItem({ groupName: 5 }), { groupName: null, category: "" });
});

test("増える件数: 切手がすでにあれば0、なければ1。ほかは作る数", () => {
  assert.equal(newRecordCount(stamps(2), stamps(3)), 0);
  assert.equal(newRecordCount(other(3), stamps(3)), 1);
  assert.equal(newRecordCount(other(3), other(2)), 2);
  assert.equal(newRecordCount([], [...stamps(2), ...other(1)]), 2);
});

test("上限: 30件目は許可、31件目はオンのときだけ止める。オフなら31件目も許可", () => {
  const on = { plan: "free" as const, enforced: true };
  assert.equal(checkRecordLimit({ current: 29, adding: 1, ...on }).ok, true);
  assert.equal(checkRecordLimit({ current: 30, adding: 1, ...on }).ok, false);
  assert.equal(checkRecordLimit({ current: 30, adding: 1, plan: "free", enforced: false }).ok, true);
});

test("上限: 足す・編集(増える件数0)は、上限を超えていても止めない。切手がすでにあれば増えない", () => {
  assert.equal(checkRecordLimit({ current: 40, adding: 0, plan: "free", enforced: true }).ok, true);
  const adding = newRecordCount([...stamps(2), ...other(29)], stamps(1));
  assert.equal(adding, 0);
  assert.equal(checkRecordLimit({ current: 30, adding, plan: "free", enforced: true }).ok, true);
});

test("プラン別の上限と、案内の文は PLAN_LIMITS の値から作る", () => {
  for (const plan of ["free", "paid1", "paid2"] as const) {
    const max = PLAN_LIMITS[plan].maxRecords;
    assert.equal(checkRecordLimit({ current: max - 1, adding: 1, plan, enforced: true }).ok, true);
    const r = checkRecordLimit({ current: max, adding: 1, plan, enforced: true });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.limit, max);
      assert.equal(r.message, recordLimitMessage(plan));
      assert.ok(r.message.includes(`${max}件`));
    }
  }
  assert.equal(
    recordLimitMessage("free"),
    `無料プランの上限(${PLAN_LIMITS.free.maxRecords}件)に達しました。不要な項目を削除するか、プランの変更をご検討ください。`,
  );
});

test("切手の保存: 作る行があるときだけ確認し、止めるなら何も書かない。足すだけなら確認しない", async () => {
  let asked = 0;
  let ran = false;
  const mk = (existing: { id: string; name: string }[], block: string | null): StampSaveDeps => ({
    async listMine() {
      return existing.map((e) => ({ ...e, category: "gift_certificate", faceValue: 1, currentBalance: 1, itemQuantity: 1, createdMillis: 1 }));
    },
    async checkCreate(c) {
      asked++;
      assert.deepEqual(c, [{ name: "切手 1円" }]);
      return block;
    },
    async runTransaction(fn) {
      ran = true;
      return fn({ async get() { return null; }, addTo() {}, create() { return "new"; } });
    },
  });
  const rows = [{ name: "切手 1円", faceValue: 1, count: 2 }];
  await assert.rejects(() => saveStamps(mk([], "上限"), rows), (e) => e instanceof RecordLimitError && e.message === "上限");
  assert.equal(ran, false);
  await saveStamps(mk([], null), rows);
  assert.equal(ran, true);
  asked = 0;
  await saveStamps(mk([{ id: "a", name: "切手 1円" }], "上限"), rows);
  assert.equal(asked, 0);
});
