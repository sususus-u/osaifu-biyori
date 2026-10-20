// ハブ経由のログイン引き継ぎで使う state(照合用の乱数)の部品(ブラウザに依存しない)。
//
// ハブへ出る前に乱数を作って localStorage に控え、戻ってきたとき、#state= の値と照合する。
// 攻撃者が作ったリンク(自分のトークンを # に付けたもの)では、控えと合わないので弾ける。
// state も、値はログ・画面・エラーに出さない。
//
// 控えを localStorage に置く理由: sessionStorage はタブごとに別で、招待のリンクなどから
// 新しいタブで戻ってくると控えが見つからず、照合で拒否されていた。localStorage は同じブラウザの
// タブで共有される(同じオリジンの中だけ。ほかのサイトからは読めない)。
// state ごとに別のキー(先頭8文字)で控えるので、複数のタブで同時に始めても、上書きしあわない。

export const STATE_KEY_PREFIX = "tamari:hubLoginState:";
export const STATE_KEY_CHARS = 8;
export const STATE_BYTES = 16;
// 長すぎる値は比べずに拒否する
export const MAX_STATE_LENGTH = 256;
// 控えの有効期間(10分)。過ぎたものは拒否し、掃除で消す
export const STATE_TTL_MS = 10 * 60 * 1000;

export type StateStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** 乱数(16バイト、16進文字列) */
export function generateState(
  getRandomValues: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a),
): string {
  const bytes = getRandomValues(new Uint8Array(STATE_BYTES));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 時間一定の比較(長さが違うときは、先に false) */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** state から控えのキーを決める(先頭8文字) */
export function stateKey(state: string): string {
  return STATE_KEY_PREFIX + state.slice(0, STATE_KEY_CHARS);
}

function parseEntry(raw: string | null): { state: string; at: number } | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.state === "string" && typeof v.at === "number") return { state: v.state, at: v.at };
  } catch {
    // 壊れた控えは、控えなしとして扱う
  }
  return null;
}

/** 期限切れ(10分より古い)や壊れた控えを消す。ほかの state の控えは触らない */
export function cleanupExpiredStates(store: StateStore, now: number = Date.now()): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key === null || !key.startsWith(STATE_KEY_PREFIX)) continue;
      const entry = parseEntry(store.getItem(key));
      if (entry === null || now - entry.at > STATE_TTL_MS) stale.push(key);
    }
    for (const key of stale) store.removeItem(key);
  } catch {
    // 掃除できなくても、ログインには影響しない
  }
}

/** 新しい state を作って控える(先に古い控えを掃除する)。控えられなければ null(ハブへは出ない) */
export function issueState(store: StateStore, now: number = Date.now()): string | null {
  try {
    cleanupExpiredStates(store, now);
    const state = generateState();
    store.setItem(stateKey(state), JSON.stringify({ state, at: now }));
    return state;
  } catch {
    return null;
  }
}

/**
 * 受け取った state を照合する。受け取った state の控えは、結果にかかわらず必ず消す(使い回しできない)。
 * - received が null(state なし。段階1の間): 通す
 * - received があり、控えと一致し、10分以内: 通す
 * - received があり、控えがない・不一致・期限切れ・長すぎる: 拒否
 */
export function consumeState(received: string | null, store: StateStore, now: number = Date.now()): boolean {
  cleanupExpiredStates(store, now);
  if (received === null) return true;
  if (received.length > MAX_STATE_LENGTH) return false;
  let entry: { state: string; at: number } | null = null;
  try {
    const key = stateKey(received);
    entry = parseEntry(store.getItem(key));
    store.removeItem(key);
  } catch {
    // 読めない・消せないときは、控えなしとして扱う
  }
  if (entry === null || now - entry.at > STATE_TTL_MS) return false;
  return safeEqual(received, entry.state);
}
