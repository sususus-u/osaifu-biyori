import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SELECTION_LIMIT,
  toggleOne,
  addMany,
  toggleGroup,
  selectAllInTab,
  groupState,
  pruneSelection,
  exitSelection,
  isAllSelectedInTab,
  toggleSelectAllInTab,
} from "./listSelection.ts";

const ids = (n: number, p = "a") => Array.from({ length: n }, (_, i) => `${p}${i}`);

test("1件の切り替え: 選ぶ→外す", () => {
  const a = toggleOne(new Set(), "x");
  assert.deepEqual([...a.next], ["x"]);
  const b = toggleOne(a.next, "x");
  assert.equal(b.next.size, 0);
  assert.equal(a.next.size, 1); // 元の Set は変えない
});

test("上限: 50件まで。51件目は選べず truncated。外すことはできる", () => {
  const full = new Set(ids(SELECTION_LIMIT));
  const over = toggleOne(full, "zzz");
  assert.equal(over.next.size, SELECTION_LIMIT);
  assert.equal(over.truncated, true);
  assert.equal(toggleOne(full, "a0").next.size, SELECTION_LIMIT - 1);
});

test("グループ選択: 足りない分を足す。全部選ばれていれば解除。上限を超える分は選ばない", () => {
  const g = ["g1", "g2", "g3"];
  const first = toggleGroup(new Set(["g2"]), g);
  assert.deepEqual([...first.next].sort(), g);
  assert.equal(toggleGroup(first.next, g).next.size, 0);
  const nearFull = new Set(ids(SELECTION_LIMIT - 1));
  const r = toggleGroup(nearFull, g);
  assert.equal(r.next.size, SELECTION_LIMIT);
  assert.equal(r.truncated, true);
});

test("すべて選択: 今のタブの項目だけ。51件以上なら先頭の50件まで。ほかのタブの選択は残る", () => {
  const r = selectAllInTab(new Set(["other"]), ids(60));
  assert.equal(r.next.size, SELECTION_LIMIT);
  assert.ok(r.next.has("other") && r.next.has("a0") && !r.next.has("a59"));
  assert.equal(r.truncated, true);
  const small = selectAllInTab(new Set(), ids(3));
  assert.equal(small.next.size, 3);
  assert.equal(small.truncated, false);
});

test("グループの状態: none / some / all。空のグループは none", () => {
  const cur = new Set(["a", "b"]);
  assert.equal(groupState(cur, ["a", "b"]), "all");
  assert.equal(groupState(cur, ["a", "c"]), "some");
  assert.equal(groupState(cur, ["c"]), "none");
  assert.equal(groupState(cur, []), "none");
});

test("消えた項目は選択から外す。変わらなければ同じ Set を返す", () => {
  const cur = new Set(["a", "b"]);
  assert.deepEqual([...pruneSelection(cur, ["a"])], ["a"]);
  assert.equal(pruneSelection(cur, ["a", "b", "c"]), cur);
});

test("addMany: 選択済みは数えない", () => {
  assert.equal(addMany(new Set(ids(SELECTION_LIMIT)), ids(5)).truncated, false);
});

test("モードを抜けたら、選択は空になる", () => {
  assert.equal(exitSelection().size, 0);
});

test("すべて選択のトグル: 全部でないとき(0件、一部)は選ぶ。全部のときは外す", () => {
  const tab = ids(3);
  const r1 = toggleSelectAllInTab(new Set(), tab);
  assert.equal(r1.next.size, 3);
  assert.equal(isAllSelectedInTab(r1.next, tab), true);
  const part = toggleSelectAllInTab(new Set(["a1"]), tab);
  assert.equal(part.next.size, 3);
  const r2 = toggleSelectAllInTab(r1.next, tab);
  assert.equal(r2.next.size, 0);
});

test("すべて選択のトグル: 解除は今のタブだけ。ほかのタブの選択は残る", () => {
  const tab = ids(3);
  const cur = new Set([...tab, "other1", "other2"]);
  assert.equal(isAllSelectedInTab(cur, tab), true);
  const r = toggleSelectAllInTab(cur, tab);
  assert.deepEqual([...r.next].sort(), ["other1", "other2"]);
});

test("すべて選択のトグル: 50件を超えるタブは先頭50件。その50件が選ばれていれば「全部」で、押すと外す", () => {
  const tab = ids(60);
  const r1 = toggleSelectAllInTab(new Set(), tab);
  assert.equal(r1.next.size, SELECTION_LIMIT);
  assert.equal(r1.truncated, true);
  assert.equal(isAllSelectedInTab(r1.next, tab), true);
  assert.equal(toggleSelectAllInTab(r1.next, tab).next.size, 0);
});

test("すべて選択のトグル: ほかのタブで選んだ分で枠が減っていても、入る分が選ばれていれば「全部」", () => {
  const tab = ids(60);
  const others = new Set(ids(10, "o"));
  const r1 = toggleSelectAllInTab(others, tab);
  assert.equal(r1.next.size, SELECTION_LIMIT);
  assert.equal(isAllSelectedInTab(r1.next, tab), true);
  const r2 = toggleSelectAllInTab(r1.next, tab);
  assert.equal(r2.next.size, 10);
});

test("すべて選択のトグル: 項目がないタブでも壊れない", () => {
  assert.equal(isAllSelectedInTab(new Set(), []), false);
  assert.equal(isAllSelectedInTab(new Set(["x"]), []), false);
  const r = toggleSelectAllInTab(new Set(["x"]), []);
  assert.deepEqual([...r.next], ["x"]);
});
