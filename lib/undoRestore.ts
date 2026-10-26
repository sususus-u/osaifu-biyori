// 「元に戻す」の中身(依頼231・依頼232)。登録・更新のあと、知らせの「元に戻す」で、押す前の状態にそのまま戻す。
//   - createIds: 登録した項目。元に戻すと、項目と履歴を消す。
//   - restores: 更新した項目。直す前の値(before)を書き戻し、その更新で足した履歴(updates)を消す。
// 一覧の画面へは sessionStorage(JSON)で渡すため、日時(Timestamp)と「無かった項目」を、JSON で表せる形に置き換えて持つ。
// Firestore への書き込みは undoRestoreFirestore.ts。ここは、テストできる純粋な関数だけ。

export interface RestoreChange {
  id: string; // 項目(accounts)の ID
  before: Record<string, unknown>; // 直す前の値(encodeValue の形)
  updateIds: string[]; // その更新で足した履歴の ID
}

export interface SavedUndo {
  createIds: string[];
  restores: RestoreChange[];
}

// 直す前に、その項目が無かった(書き戻すときは、項目ごと消す)
export const DELETED = { __delete: true } as const;

export function encodeValue(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(encodeValue);
  const o = v as Record<string, unknown> & { toMillis?: unknown };
  if (typeof o.toMillis === "function" && typeof o.seconds === "number" && typeof o.nanoseconds === "number") {
    return { __ts: [o.seconds, o.nanoseconds] };
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) out[k] = encodeValue(x);
  return out;
}

export function decodeValue(v: unknown, makeTs: (s: number, ns: number) => unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => decodeValue(x, makeTs));
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 1 && Array.isArray(o.__ts) && o.__ts.length === 2) {
    return makeTs(Number(o.__ts[0]), Number(o.__ts[1]));
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) out[k] = decodeValue(x, makeTs);
  return out;
}

// 書き戻す値を作る。無かった項目は del()(Firestore の deleteField)にする
export function decodeBefore(
  before: Record<string, unknown>,
  makeTs: (s: number, ns: number) => unknown,
  del: () => unknown
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(before)) {
    const isDeleted = typeof v === "object" && v !== null && (v as Record<string, unknown>).__delete === true;
    out[k] = isDeleted ? del() : decodeValue(v, makeTs);
  }
  return out;
}

// 直す前の値のうち、これから書く項目(keys)だけを取る
export function pickBefore(data: Record<string, unknown> | undefined, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = data && k in data ? encodeValue(data[k]) : { ...DELETED };
  return out;
}

// 続けて登録する途中で、知らせを足すとき。どちらかが元に戻せなければ、まとめても戻せない
export function mergeUndo(a: SavedUndo | undefined, b: SavedUndo | undefined): SavedUndo | undefined {
  if (!a || !b) return undefined;
  return { createIds: [...a.createIds, ...b.createIds], restores: [...a.restores, ...b.restores] };
}

export function isSavedUndo(v: unknown): v is SavedUndo {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.createIds) || !o.createIds.every((x) => typeof x === "string" && x !== "")) return false;
  if (!Array.isArray(o.restores)) return false;
  const okRestore = (r: unknown) => {
    if (typeof r !== "object" || r === null) return false;
    const x = r as Record<string, unknown>;
    return (
      typeof x.id === "string" &&
      x.id !== "" &&
      typeof x.before === "object" &&
      x.before !== null &&
      Array.isArray(x.updateIds) &&
      x.updateIds.every((u) => typeof u === "string" && u !== "")
    );
  };
  return o.restores.every(okRestore) && o.createIds.length + o.restores.length > 0;
}

// トランザクションの中で読んだ値と、足した履歴の ID を控える(依頼232。切手の保存、今回の分の追加)。
// トランザクションがやり直されたときは、最後に読んだ値で上書きする。
export interface UndoCapture {
  onRead(id: string, data: Record<string, unknown>): void;
  onHistory(id: string, historyId: string): void;
  restoreFor(id: string, keys: string[]): RestoreChange;
}

export function makeUndoCapture(): UndoCapture {
  const reads = new Map<string, Record<string, unknown>>();
  const histories = new Map<string, string[]>();
  return {
    onRead(id, data) {
      reads.set(id, data);
      histories.delete(id);
    },
    onHistory(id, historyId) {
      histories.set(id, [...(histories.get(id) ?? []), historyId]);
    },
    restoreFor(id, keys) {
      return { id, before: pickBefore(reads.get(id), keys), updateIds: histories.get(id) ?? [] };
    },
  };
}

export function undoDoneMessage(u: SavedUndo): string {
  return u.restores.length === 0 ? "登録を取り消しました" : "元に戻しました";
}
