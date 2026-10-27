// ハブのホームのカード(https://osaifu.okizukibiyori.com/?entry=home)から開かれたときの入口の部品
// (ブラウザに依存しない。依頼264、M3 案2 の1回目)。
//
// 以前は、ハブが #authToken= を付けて直接開いていた(ログインの CSRF ができる形)。
// これからは、ハブは ?entry=home だけを付けて開き、このアプリが state を作って控えてから、
// ハブのログイン画面(return に ?state= を足す)へ移動し直す。ハブは return へ #authToken= を付けて戻す。
//
// - authToken(クエリ・フラグメントのどちらでも)があるときは、entry を無視する(外すだけ)
// - return のURLには entry を入れない(戻ってきて、もう一度ハブへ出る往復を防ぐ)

import { AUTH_TOKEN_PARAM } from "./authToken.ts";
import { buildHubLoginUrl } from "./hubLogin.ts";

export const ENTRY_PARAM = "entry";
export const ENTRY_HOME = "home";

export type HomeEntryPlan =
  /** entry がない。何もしない */
  | { action: "none" }
  /** entry を外して、そのまま進む(cleanedPath = 外したあとの「パス+クエリ+フラグメント」) */
  | { action: "strip"; cleanedPath: string }
  /** entry を外したURLを return にして、ハブのログイン画面へ移動する */
  | { action: "redirect"; returnHref: string };

/** URL に authToken が付いているか(クエリ・フラグメントのどちらでも。値は読まない) */
export function hasAuthTokenInUrl(href: string): boolean {
  const url = new URL(href);
  if (url.searchParams.has(AUTH_TOKEN_PARAM)) return true;
  return url.hash
    .replace(/^#/, "")
    .split("&")
    .some((part) => {
      const eq = part.indexOf("=");
      return (eq === -1 ? part : part.slice(0, eq)) === AUTH_TOKEN_PARAM;
    });
}

/** entry を外した絶対URL(ほかのクエリ・パス・フラグメントは残す) */
export function stripEntry(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(ENTRY_PARAM);
  return url.toString();
}

/** 開かれたURLから、入口で何をするかを決める */
export function planHomeEntry(href: string): HomeEntryPlan {
  const url = new URL(href);
  if (!url.searchParams.has(ENTRY_PARAM)) return { action: "none" };
  const isHome = url.searchParams.get(ENTRY_PARAM) === ENTRY_HOME;
  const stripped = new URL(stripEntry(href));
  if (isHome && !hasAuthTokenInUrl(href)) {
    return { action: "redirect", returnHref: stripped.toString() };
  }
  return { action: "strip", cleanedPath: stripped.pathname + stripped.search + stripped.hash };
}

/** ハブのログイン画面のURL(return = entry を外した今のURL + ?state=) */
export function buildHomeEntryLoginUrl(href: string, state: string): string {
  return buildHubLoginUrl(stripEntry(href), state);
}

// --- ログイン済みなら、ホームを通らない(依頼272) ---
// ?entry=home で開かれたとき、このアプリの Firebase のログイン状態を先に見る。
// ログイン済みで、ログインがまだ有効(ハブでのログアウトで取り消されていない)なら、ハブへ出ない。
// ハブとこのアプリでアカウントが違っていても、このアプリは自分のアカウントのまま。

/** ログインの有効さを確かめた結果(user.getIdToken(true) の成否)。null = ログインしていない */
export type HomeEntrySessionCheck = null | { ok: true } | { ok: false; code: string };

export type HomeEntrySessionDecision =
  /** ログイン済みで有効(または確かめられなかった)。entry を外して、そのまま一覧を出す */
  | "skip"
  /** ログインしていない。state を作って、ハブのログイン画面へ往復する */
  | "roundTrip"
  /** ログインが取り消されていた。この端末でログアウトしてから、ハブのログイン画面へ往復する */
  | "signOutThenRoundTrip";

/** ログインが取り消された・切れた・アカウントが無いことを表すエラー(ハブでのログアウトなど) */
export const REVOKED_SESSION_ERROR_CODES: readonly string[] = [
  "auth/user-token-expired",
  "auth/user-disabled",
  "auth/user-not-found",
  "auth/invalid-user-token",
];

/**
 * 入口で、ハブへ往復するかを決める。
 * - ログインしていない → 往復
 * - 確かめが通った → 往復しない
 * - 取り消し・期限切れ・無効・アカウントなし → この端末でログアウトしてから往復
 * - 通信の失敗(auth/network-request-failed)や、そのほかのエラー・時間切れ → ログイン済みとして進む
 *   (ハブへ出ても、戻ってきたときに同じことになりうる。本当に取り消されていれば、あとでログイン状態の監視が気づく)
 */
export function decideHomeEntrySession(check: HomeEntrySessionCheck): HomeEntrySessionDecision {
  if (check === null) return "roundTrip";
  if (check.ok) return "skip";
  if (REVOKED_SESSION_ERROR_CODES.includes(check.code)) return "signOutThenRoundTrip";
  return "skip";
}
