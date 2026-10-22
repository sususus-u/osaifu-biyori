// 一覧の選択モードの、選択の計算(純粋な関数。画面は components/AccountList.tsx)。
// 選択は id の Set。一度に選べるのは SELECTION_LIMIT 件まで。上限を超える分は選ばず、truncated で知らせる。

export const SELECTION_LIMIT = 50;

export interface SelectionResult {
  next: Set<string>;
  // 上限のせいで、選べなかった項目があった
  truncated: boolean;
}

// 1件の切り替え。選ばれていれば外す。選ばれていなくて上限なら、そのまま(truncated)
export function toggleOne(current: Set<string>, id: string): SelectionResult {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
    return { next, truncated: false };
  }
  if (next.size >= SELECTION_LIMIT) return { next, truncated: true };
  next.add(id);
  return { next, truncated: false };
}

// 複数を加える(上限まで。先頭から順に)
export function addMany(current: Set<string>, ids: string[]): SelectionResult {
  const next = new Set(current);
  let truncated = false;
  for (const id of ids) {
    if (next.has(id)) continue;
    if (next.size >= SELECTION_LIMIT) {
      truncated = true;
      break;
    }
    next.add(id);
  }
  return { next, truncated };
}

// グループの見出し: 中が全部選ばれていれば全部外す。そうでなければ、足りない分を足す(上限まで)
export function toggleGroup(current: Set<string>, ids: string[]): SelectionResult {
  if (ids.length > 0 && ids.every((id) => current.has(id))) {
    const next = new Set(current);
    for (const id of ids) next.delete(id);
    return { next, truncated: false };
  }
  return addMany(current, ids);
}

// 「すべて選択」: 今のタブの全項目(tabIds)を足す(上限まで)。ほかのタブで選んだ分は残る
export function selectAllInTab(current: Set<string>, tabIds: string[]): SelectionResult {
  return addMany(current, tabIds);
}

// グループの見出しのチェックの状態
export function groupState(current: Set<string>, ids: string[]): "none" | "some" | "all" {
  const n = ids.filter((id) => current.has(id)).length;
  if (n === 0) return "none";
  return n === ids.length ? "all" : "some";
}

// 一覧から消えた項目を、選択から外す(別の端末で削除された、など)
export function pruneSelection(current: Set<string>, existingIds: string[]): Set<string> {
  const exists = new Set(existingIds);
  const next = new Set<string>();
  for (const id of current) if (exists.has(id)) next.add(id);
  return next.size === current.size ? current : next;
}

export const SELECTION_LIMIT_MESSAGE = `一度に選べるのは${SELECTION_LIMIT}件までです`;

// 選択モードを抜けたとき: 選択はすべて解除する
export function exitSelection(): Set<string> {
  return new Set();
}

// 今のタブの全項目が選ばれているか(「すべて選択」を押した結果と同じ状態か)。
// 上限があるので、ほかのタブで選んだ分を引いた残りの枠(capacity)で、先頭から選べるだけ選ばれていれば「全部」とみなす。
// 項目がないタブは false
export function isAllSelectedInTab(current: Set<string>, tabIds: string[]): boolean {
  const inTab = tabIds.filter((id) => current.has(id));
  const capacity = SELECTION_LIMIT - (current.size - inTab.length);
  const expected = tabIds.slice(0, Math.max(0, Math.min(tabIds.length, capacity)));
  return expected.length > 0 && inTab.length === expected.length && expected.every((id) => current.has(id));
}

// 「すべて選択 / すべて解除」のトグル。全部選ばれていれば今のタブの選択を外し(ほかのタブは残す)、そうでなければ選ぶ
export function toggleSelectAllInTab(current: Set<string>, tabIds: string[]): SelectionResult {
  if (isAllSelectedInTab(current, tabIds)) {
    const next = new Set(current);
    for (const id of tabIds) next.delete(id);
    return { next, truncated: false };
  }
  return selectAllInTab(current, tabIds);
}
