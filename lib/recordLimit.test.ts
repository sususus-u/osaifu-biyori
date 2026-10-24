import { test } from "node:test";
import assert from "node:assert/strict";
import { newRecordCount, isStampRecord, type CountItem } from "./recordCount.ts";
import { checkCreate, RecordLimitError, type HubCheckResponse } from "./hubRecordCheck.ts";
import { saveStamps, type StampSaveDeps } from "./stampSave.ts";

const gift = (groupName: string | null): CountItem => ({ groupName, category: "gift_certificate" });
const other = (n = 1): CountItem[] => Array.from({ length: n }, () => ({ groupName: null, category: "point" }));
const stamps = (n: number): CountItem[] => Array.from({ length: n }, () => gift("切手"));

test("増える件数: 切手がすでにあれば0、なければ1(いくつ作っても1)。ほかは作る数", () => {
  assert.equal(newRecordCount(true, stamps(3)), 0);
  assert.equal(newRecordCount(false, stamps(3)), 1);
  assert.equal(newRecordCount(false, other(2)), 2);
  assert.equal(newRecordCount(true, other(2)), 2);
  assert.equal(newRecordCount(false, [...stamps(2), ...other(1)]), 2);
  assert.equal(newRecordCount(true, [...stamps(2), ...other(1)]), 1);
  assert.equal(newRecordCount(false, []), 0);
});

test("切手の判定: グループ名「切手」かつ種類 gift_certificate だけ", () => {
  assert.equal(isStampRecord({ groupName: "切手", category: "point" }), false);
  assert.equal(isStampRecord(gift(" 切手 ")), true);
  assert.equal(isStampRecord(gift("図書カード")), false);
  assert.equal(isStampRecord(gift(null)), false);
});

const res = (status: number, body: unknown): HubCheckResponse => ({ status, json: async () => body });
const quiet = () => {};

test("問い合わせ: 許可・超過(ハブの案内の文をそのまま返す)", async () => {
  assert.deepEqual(await checkCreate(1, async () => res(200, { ok: true, total: 3, plan: "free", message: null }), quiet), { ok: true });
  assert.deepEqual(
    await checkCreate(1, async () => res(200, { ok: false, total: 30, plan: "free", message: "上限です" }), quiet),
    { ok: false, message: "上限です" },
  );
});

test("問い合わせ: 増える件数が0なら、問い合わせない(足す・編集・残高の更新)", async () => {
  let called = 0;
  const post = async () => { called++; return res(200, { ok: false, message: "x" }); };
  assert.deepEqual(await checkCreate(0, post, quiet), { ok: true });
  assert.equal(called, 0);
});

test("問い合わせ: タイムアウト・通信の失敗・5xx・形の違う返事は、許可として扱い、ログに種類だけ出す", async () => {
  const logs: string[] = [];
  const log = (k: string) => logs.push(k);
  assert.deepEqual(await checkCreate(1, () => new Promise(() => {}), log, 20), { ok: true });
  assert.deepEqual(await checkCreate(1, async () => { throw new Error("secret-detail"); }, log), { ok: true });
  assert.deepEqual(await checkCreate(1, async () => res(503, { ok: false, message: "x" }), log), { ok: true });
  assert.deepEqual(await checkCreate(1, async () => res(504, null), log), { ok: true });
  assert.deepEqual(await checkCreate(1, async () => res(401, { error: "unauthorized" }), log), { ok: true });
  assert.deepEqual(await checkCreate(1, async () => res(200, { hello: 1 }), log), { ok: true });
  assert.deepEqual(await checkCreate(1, async () => ({ status: 200, json: async () => { throw new Error("bad json"); } }), log), { ok: true });
  assert.deepEqual(logs, ["timeout", "network", "hub-5xx", "hub-5xx", "hub-http", "bad-response", "network"]);
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
