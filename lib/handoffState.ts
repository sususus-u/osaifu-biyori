// ハブ経由のログイン引き継ぎで使う state(照合用の乱数)の部品(ブラウザに依存しない)。
//
// ハブへ出る前に乱数を作って sessionStorage に控え、戻ってきたとき、#state= の値と照合する。
// 攻撃者が作ったリンク(自分のトークンを # に付けたもの)では、控えと合わないので弾ける。
// state も、値はログ・画面・エラーに出さない。

export const STATE_STORAGE_KEY = "tamari:hubLoginState";
export const STATE_BYTES = 16;
// 長すぎる値は比べずに拒否する
export const MAX_STATE_LENGTH = 256;

export type StateStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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

/** 新しい state を作って控える。控えられなければ null(ハブへは出ない) */
export function issueState(store: StateStore): string | null {
  try {
    const state = generateState();
    store.setItem(STATE_STORAGE_KEY, state);
    return state;
  } catch {
    return null;
  }
}

/**
 * 受け取った state を照合する。控えは、結果にかかわらず必ず消す(使い回しできない)。
 * - received が null(state なし。段階1の間): 通す
 * - received があり、控えと一致: 通す
 * - received があり、控えがない・不一致・長すぎる: 拒否
 */
export function consumeState(received: string | null, store: StateStore): boolean {
  let stored: string | null = null;
  try {
    stored = store.getItem(STATE_STORAGE_KEY);
    store.removeItem(STATE_STORAGE_KEY);
  } catch {
    // 読めない・消せないときは、控えなしとして扱う
  }
  if (received === null) return true;
  if (stored === null || received.length > MAX_STATE_LENGTH) return false;
  return safeEqual(received, stored);
}
