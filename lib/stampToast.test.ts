import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAMP_SAVED_MESSAGE_KEY,
  STAMP_WAIT_MS,
  clearStampSavedMessage,
  peekStampSavedMessage,
  planWaitTimeout,
  decideBind,
  pickTab,
  planStampNotices,
  stashStampSavedMessage,
  takeStampSavedMessage,
  type ListAccount,
  type MessageStorage,
  type StampSavedPayload,
} from "./stampToast.ts";

function fake(): MessageStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const payload: StampSavedPayload = {
  message: "切手 1円に5枚追加しました(合計23枚)\n切手 2円を新しく作りました(25枚)",
  items: [
    { id: "a", kind: "add", text: "切手 1円に5枚追加しました(合計23枚)" },
    { id: "b", kind: "create", text: "切手 2円を新しく作りました(25枚)" },
  ],
};

// ---- sessionStorage の読み書き ----

test("入れた案内(JSON)を、そのまま読める。複数の項目も", () => {
  const s = fake();
  stashStampSavedMessage(s, payload);
  assert.deepEqual(JSON.parse(s.data.get(STAMP_SAVED_MESSAGE_KEY)!), payload);
  assert.deepEqual(takeStampSavedMessage(s), payload);
});

test("読んだら消える(2回目は何も出ない)", () => {
  const s = fake();
  stashStampSavedMessage(s, payload);
  assert.ok(takeStampSavedMessage(s));
  assert.equal(takeStampSavedMessage(s), null);
  assert.equal(s.data.size, 0);
});

test("古い形式(文字列だけ)も読める。項目は空で、全文が入る", () => {
  const s = fake();
  s.setItem(STAMP_SAVED_MESSAGE_KEY, "切手 1円に5枚追加しました(合計23枚)");
  assert.deepEqual(takeStampSavedMessage(s), { message: "切手 1円に5枚追加しました(合計23枚)", items: [] });
});

test("壊れた JSON や形の違う項目で、落ちない", () => {
  const s = fake();
  s.setItem(STAMP_SAVED_MESSAGE_KEY, "{broken");
  assert.deepEqual(takeStampSavedMessage(s), { message: "{broken", items: [] });
  s.setItem(STAMP_SAVED_MESSAGE_KEY, JSON.stringify({ message: "x", items: [{ id: 1 }, { id: "z", kind: "add", text: "t" }, null] }));
  assert.deepEqual(takeStampSavedMessage(s), { message: "x", items: [{ id: "z", kind: "add", text: "t" }] });
  s.setItem(STAMP_SAVED_MESSAGE_KEY, JSON.stringify({ items: [] }));
  assert.equal(takeStampSavedMessage(s), null);
});

test("キーがなければ何も出ない。空の文は入れない。storage の例外でも落ちない", () => {
  assert.equal(takeStampSavedMessage(fake()), null);
  const s = fake();
  stashStampSavedMessage(s, { message: "  ", items: [] });
  assert.equal(s.data.size, 0);
  const broken: MessageStorage = {
    getItem: () => { throw new Error("x"); },
    setItem: () => { throw new Error("x"); },
    removeItem: () => { throw new Error("x"); },
  };
  assert.doesNotThrow(() => stashStampSavedMessage(broken, payload));
  assert.equal(takeStampSavedMessage(broken), null);
  assert.equal(takeStampSavedMessage(null), null);
});

// ---- 読んでも消さない(表示を始めてから消す)----

test("peek は読んでも消さない。再マウントで何度読んでも同じ案内。clear の後は出ない(二重に出ない)", () => {
  const s = fake();
  stashStampSavedMessage(s, payload);
  assert.deepEqual(peekStampSavedMessage(s), payload);
  assert.equal(s.data.size, 1);
  assert.deepEqual(peekStampSavedMessage(s), payload); // 再マウント
  clearStampSavedMessage(s); // 表示を始めた
  assert.equal(s.data.size, 0);
  assert.equal(peekStampSavedMessage(s), null);
});

test("peek / clear は、storage がなくても例外でも落ちない", () => {
  const broken: MessageStorage = {
    getItem: () => { throw new Error("x"); },
    setItem: () => {},
    removeItem: () => { throw new Error("x"); },
  };
  assert.equal(peekStampSavedMessage(null), null);
  assert.equal(peekStampSavedMessage(broken), null);
  assert.doesNotThrow(() => clearStampSavedMessage(broken));
  assert.doesNotThrow(() => clearStampSavedMessage(null));
});

test("読み込み待ち(3秒超)は、全文を上部のトーストへ。行には結びつけない", () => {
  assert.equal(STAMP_WAIT_MS, 3000);
  assert.equal(planWaitTimeout(payload).fallback, payload.message);
});

// ---- 結びつけ: 行が結びついたらトーストを出さない。見つからないときだけ出す ----

const listAB: ListAccount[] = [
  { id: "a", name: "切手 1円", hasExpiry: false },
  { id: "b", name: "切手 2円", hasExpiry: false },
];

test("decideBind: 全部の行が見つかれば、行の下だけで、上部のトーストは出ない", () => {
  const plan = decideBind(payload, listAB, "noExpiry", false)!;
  assert.deepEqual(Object.keys(plan.notices).sort(), ["a", "b"]);
  assert.equal(plan.fallback, null);
});

test("decideBind: 一部が見つからない間は待つ(先にトーストを出さない)。待ち時間を超えたら、見つかった分は行へ、残りだけトースト", () => {
  const onlyA = listAB.slice(0, 1);
  assert.equal(decideBind(payload, onlyA, "noExpiry", false), null);
  const plan = decideBind(payload, onlyA, "noExpiry", true)!;
  assert.deepEqual(Object.keys(plan.notices), ["a"]);
  assert.equal(plan.fallback, payload.items[1].text);
});

test("decideBind: 行が1つも見つからないまま待ち時間を超えたときだけ、全項目がトースト", () => {
  assert.equal(decideBind(payload, [], "noExpiry", false), null);
  const plan = decideBind(payload, [], "noExpiry", true)!;
  assert.deepEqual(plan.notices, {});
  assert.equal(plan.fallback, payload.items.map((i) => i.text).join("\n"));
});

test("decideBind: 古い形式(項目なし)は待たず、全文をトースト", () => {
  const plan = decideBind({ message: "古い", items: [] }, listAB, "noExpiry", false)!;
  assert.equal(plan.fallback, "古い");
});

// ---- 行の下の案内(noticesById)、代わりの案内、タブの決め方 ----

const noExp = (id: string): ListAccount => ({ id, name: "切手 1円", hasExpiry: false });
const dated = (id: string): ListAccount => ({ id, name: "期限あり", hasExpiry: true });
const periodName = (id: string): ListAccount => ({ id, name: "期間限定の券", hasExpiry: false });

test("noticesById: 見つかった項目ごとに、行の下に出す文を作る。最初の行へ動かす", () => {
  const plan = planStampSave2([noExp("a"), noExp("b")], "noExpiry");
  assert.deepEqual(plan.notices, { a: payload.items[0].text, b: payload.items[1].text });
  assert.equal(plan.firstId, "a");
  assert.equal(plan.fallback, null); // 二重に出さない
  assert.equal(plan.tab, "noExpiry");
});

function planStampSave2(accounts: ListAccount[], tab: "withExpiry" | "noExpiry" | "byGroup") {
  return planStampNotices(payload, accounts, tab);
}

test("行が見つからないときは、上部のトースト(代わり)に全文", () => {
  const plan = planStampSave2([], "noExpiry");
  assert.deepEqual(plan.notices, {});
  assert.equal(plan.firstId, null);
  assert.equal(plan.fallback, payload.items.map((i) => i.text).join("\n"));
  assert.equal(plan.tab, "noExpiry"); // 行がなければタブは変えない
});

test("一部だけ見つかったときは、見つかった分は行の下、見つからない分だけ上部のトースト", () => {
  const plan = planStampSave2([noExp("a")], "noExpiry");
  assert.deepEqual(plan.notices, { a: payload.items[0].text });
  assert.equal(plan.fallback, payload.items[1].text);
});

test("古い形式(項目なし)は、全文を上部のトースト", () => {
  const plan = planStampNotices({ message: "全文", items: [] }, [noExp("a")], "noExpiry");
  assert.equal(plan.fallback, "全文");
  assert.deepEqual(plan.notices, {});
});

test("タブ: 今のタブで見えればそのまま。見えなければ行のあるタブ。バラバラなら「サービス別」", () => {
  assert.equal(pickTab("noExpiry", [noExp("a")]), "noExpiry");
  assert.equal(pickTab("byGroup", [noExp("a"), dated("b")]), "byGroup");
  assert.equal(pickTab("byGroup", [periodName("a")]), "byGroup");
  // 別のタブにあるとき
  assert.equal(pickTab("withExpiry", [noExp("a")]), "noExpiry");
  assert.equal(pickTab("noExpiry", [periodName("a")]), "withExpiry");
  // 期限日つきは、月ごとの折りたたみで隠れうるので「サービス別」
  assert.equal(pickTab("noExpiry", [dated("a")]), "byGroup");
  assert.equal(pickTab("withExpiry", [dated("a")]), "byGroup");
  // 複数の行が別々のタブ
  assert.equal(pickTab("withExpiry", [noExp("a"), periodName("b")]), "byGroup");
  // 行がなければ変えない
  assert.equal(pickTab("withExpiry", []), "withExpiry");
});
