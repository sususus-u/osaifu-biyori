// 実行: npm test(Node 標準のテスト機能。追加の部品は不要)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATE_STORAGE_KEY,
  consumeState,
  generateState,
  issueState,
  safeEqual,
  type StateStore,
} from "./handoffState.ts";

function memoryStore(init: Record<string, string> = {}): StateStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("generateState は16バイトの16進文字列で、毎回違う", () => {
  const a = generateState();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, generateState());
});
test("issueState は控える。控えられないときは null", () => {
  const s = memoryStore();
  const st = issueState(s);
  assert.equal(s.data.get(STATE_STORAGE_KEY), st);
  const broken: StateStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error("no");
    },
    removeItem: () => {},
  };
  assert.equal(issueState(broken), null);
});
test("state なしは通る。控えが残っていれば消す", () => {
  const s = memoryStore({ [STATE_STORAGE_KEY]: "abc" });
  assert.equal(consumeState(null, s), true);
  assert.equal(s.data.size, 0);
  assert.equal(consumeState(null, memoryStore()), true);
});
test("state 一致で通り、控えが消える", () => {
  const s = memoryStore({ [STATE_STORAGE_KEY]: "abc123" });
  assert.equal(consumeState("abc123", s), true);
  assert.equal(s.data.size, 0);
});
test("不一致は拒否。控えも消える", () => {
  const s = memoryStore({ [STATE_STORAGE_KEY]: "abc123" });
  assert.equal(consumeState("abc124", s), false);
  assert.equal(s.data.size, 0);
});
test("控えなしで state だけあると拒否", () => {
  assert.equal(consumeState("abc123", memoryStore()), false);
});
test("同じ state は2回使えない", () => {
  const s = memoryStore({ [STATE_STORAGE_KEY]: "abc123" });
  assert.equal(consumeState("abc123", s), true);
  assert.equal(consumeState("abc123", s), false);
});
test("長すぎる state は拒否", () => {
  const long = "a".repeat(1000);
  assert.equal(consumeState(long, memoryStore({ [STATE_STORAGE_KEY]: long })), false);
});
test("safeEqual", () => {
  assert.equal(safeEqual("ab", "ab"), true);
  assert.equal(safeEqual("ab", "ac"), false);
  assert.equal(safeEqual("ab", "abc"), false);
});
