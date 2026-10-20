// 実行: npm test(Node 標準のテスト機能。追加の部品は不要)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATE_KEY_PREFIX,
  STATE_TTL_MS,
  cleanupExpiredStates,
  consumeState,
  generateState,
  issueState,
  safeEqual,
  stateKey,
  type StateStore,
} from "./handoffState.ts";

// localStorage の代わり(キーの一覧も取れる)。複数のタブは、同じ store を共有する形で表す
function memoryStore(init: Record<string, string> = {}): StateStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => Array.from(data.keys())[i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const entry = (state: string, at: number) => JSON.stringify({ state, at });
const NOW = 1_000_000_000_000;

test("generateState は16バイトの16進文字列で、毎回違う", () => {
  const a = generateState();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, generateState());
});
test("issueState は state ごとのキー(先頭8文字)に、state 全体と時刻を控える。控えられないときは null", () => {
  const s = memoryStore();
  const st = issueState(s, NOW)!;
  assert.equal(stateKey(st), STATE_KEY_PREFIX + st.slice(0, 8));
  assert.deepEqual(JSON.parse(s.data.get(stateKey(st))!), { state: st, at: NOW });
  const broken: StateStore = {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => {
      throw new Error("no");
    },
    removeItem: () => {},
  };
  assert.equal(issueState(broken), null);
});
test("別のタブで戻ってきても(同じ localStorage を共有)、控えが見つかって通る", () => {
  const shared = memoryStore();
  const st = issueState(shared, NOW)!; // タブ1でハブへ出る
  assert.equal(consumeState(st, shared, NOW + 5000), true); // タブ2で戻る
  assert.equal(shared.data.size, 0);
});
test("複数の state を同時に控えても、上書きしあわない", () => {
  const shared = memoryStore();
  const a = issueState(shared, NOW)!;
  const b = issueState(shared, NOW + 1)!;
  assert.equal(shared.data.size, 2);
  assert.equal(consumeState(b, shared, NOW + 100), true);
  assert.equal(consumeState(a, shared, NOW + 100), true);
});
test("state なしは通る(控えは触らない)", () => {
  const s = memoryStore({ [stateKey("abcdef0123")]: entry("abcdef0123", NOW) });
  assert.equal(consumeState(null, s, NOW), true);
  assert.equal(s.data.size, 1);
  assert.equal(consumeState(null, memoryStore()), true);
});
test("不一致は拒否。その控えも消える(先頭8文字が同じで、残りが違う場合)", () => {
  const s = memoryStore({ [stateKey("abc12345xx")]: entry("abc12345xx", NOW) });
  assert.equal(consumeState("abc12345yy", s, NOW), false);
  assert.equal(s.data.size, 0);
});
test("控えなしで state だけあると拒否", () => {
  assert.equal(consumeState("abc123", memoryStore(), NOW), false);
});
test("同じ state は2回使えない", () => {
  const s = memoryStore();
  const st = issueState(s, NOW)!;
  assert.equal(consumeState(st, s, NOW + 1), true);
  assert.equal(consumeState(st, s, NOW + 2), false);
});
test("10分を過ぎた控えは拒否され、消える。ちょうど10分は通る", () => {
  const s = memoryStore();
  const st = issueState(s, NOW)!;
  assert.equal(consumeState(st, s, NOW + STATE_TTL_MS + 1), false);
  assert.equal(s.data.size, 0);
  const s2 = memoryStore();
  const st2 = issueState(s2, NOW)!;
  assert.equal(consumeState(st2, s2, NOW + STATE_TTL_MS), true);
});
test("掃除で、古い控え(と壊れた控え)だけ消え、新しい控えと他のキーは残る", () => {
  const s = memoryStore({
    [STATE_KEY_PREFIX + "old00001"]: entry("old00001zz", NOW - STATE_TTL_MS - 1),
    [STATE_KEY_PREFIX + "broken01"]: "壊れた値",
    [STATE_KEY_PREFIX + "new00001"]: entry("new00001zz", NOW - 1000),
    "tamari:hubLoginRedirects": "1",
    other: "x",
  });
  cleanupExpiredStates(s, NOW);
  assert.deepEqual(Array.from(s.data.keys()).sort(), [
    "other",
    "tamari:hubLoginRedirects",
    STATE_KEY_PREFIX + "new00001",
  ]);
});
test("issueState と consumeState でも掃除される", () => {
  const old = { [STATE_KEY_PREFIX + "old00001"]: entry("old00001zz", NOW - STATE_TTL_MS - 1) };
  const s1 = memoryStore(old);
  issueState(s1, NOW);
  assert.equal(s1.data.has(STATE_KEY_PREFIX + "old00001"), false);
  const s2 = memoryStore(old);
  consumeState(null, s2, NOW);
  assert.equal(s2.data.size, 0);
});
test("長すぎる state は拒否", () => {
  const long = "a".repeat(1000);
  assert.equal(consumeState(long, memoryStore({ [stateKey(long)]: entry(long, NOW) }), NOW), false);
});
test("safeEqual", () => {
  assert.equal(safeEqual("ab", "ab"), true);
  assert.equal(safeEqual("ab", "ac"), false);
  assert.equal(safeEqual("ab", "abc"), false);
});
