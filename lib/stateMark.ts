// 引き継ぎで、state なしのトークンを受け入れた回数・state の照合で拒否した回数を、ハブへ知らせる部品
// (依頼264、M3 案2 の1回目)。段階2(state なしを拒否)へ進めてよいかを、数で判断するため。
//
// 送るのは、サービスの識別子(内部の名前 tamari-biyori のまま)と種類だけ。uid・トークン・state は送らない。
// 文字列で送る(text/plain になり、事前の確認の通信が要らない)。失敗しても、ログインは止めない。

export const STATE_MARK_URL = "https://okizukibiyori.com/api/auth-state-mark";
export const STATE_MARK_SERVICE = "tamari-biyori";

export type StateMarkKind = "no-state" | "mismatch";

export function buildStateMarkBody(kind: StateMarkKind): string {
  return JSON.stringify({ service: STATE_MARK_SERVICE, kind });
}

/** ハブへ知らせる。送れなくても何もしない */
export function sendStateMark(
  kind: StateMarkKind,
  nav: { sendBeacon?: (url: string, data?: string) => boolean } | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): void {
  try {
    nav?.sendBeacon?.(STATE_MARK_URL, buildStateMarkBody(kind));
  } catch {
    // 知らせられなくても、ログインには影響しない
  }
}
