// 自分の呼び名(依頼366 仕事1)。呼び名は、おきづきびより(ホーム)の1か所だけで決める。
// 正本: Firestore の users/{uid}.username(ホームのサーバーが保存し、users/{uid}.displayName にも写す)。
// このアプリでは、読むだけ。変えるのは、ホームの「アカウント」で(このアプリに入力の欄は置かない)。
//
// 引き継ぎの決まり: ホームの呼び名を先に。無ければ、このアプリの古い表示名(users/{uid}.displayName)。
// どちらも無ければ null(名前を出す所では「（表示名なし）」)。

/** 呼び名の長さの上限(ホームの決まりと同じ 20文字) */
export const OWN_NAME_MAX = 20;

/** 名前が無いときに、名前の代わりに出す文字 */
export const NO_NAME_TEXT = "（表示名なし）";

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return Array.from(t).slice(0, OWN_NAME_MAX).join("");
}

/** users/{uid} の中身から、自分の呼び名を選ぶ(ホームの username を先に、無ければ古い displayName) */
export function pickOwnName(data: { username?: unknown; displayName?: unknown } | null | undefined): string | null {
  if (!data) return null;
  return clean(data.username) ?? clean(data.displayName);
}

/** 画面に出す名前(無ければ「（表示名なし）」) */
export function ownNameText(data: { username?: unknown; displayName?: unknown } | null | undefined): string {
  return pickOwnName(data) ?? NO_NAME_TEXT;
}
