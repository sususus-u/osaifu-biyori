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
