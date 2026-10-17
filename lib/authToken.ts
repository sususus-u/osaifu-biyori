// ハブからの引き継ぎ用 authToken を、URL から読み取り・取り除く部品(ブラウザに依存しない)。
//
// 読むのはフラグメント(#authToken=…)だけ。フラグメントはサーバーに送られない。
// クエリ(?authToken=…)は履歴やログに残りやすいので、読まずに URL から取り除くだけにする。
// 値はここでもログに出さない。

export const AUTH_TOKEN_PARAM = "authToken";
export const STATE_PARAM = "state";
// 長すぎる値は読まずに拒否する(Firebase のカスタムトークンは数KBに収まる)
export const MAX_AUTH_TOKEN_LENGTH = 4096;

export type AuthTokenExtraction = {
  /** 読み取れたトークン。なし・空・長すぎるときは null */
  token: string | null;
  /** 戻り先のクエリ(?state=)の値(照合用の乱数)。なければ null。照合は handoffState.ts */
  state: string | null;
  /** 値が長すぎて拒否したか(引き継ぎの失敗として扱う) */
  rejected: boolean;
  /** authToken を取り除いたあとの「パス+クエリ+フラグメント」 */
  cleanedPath: string;
};

function readFragmentToken(hash: string): { value: string | null; rest: string } {
  const parts = hash.replace(/^#/, "").split("&");
  let value: string | null = null;
  const kept: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if ((eq === -1 ? part : part.slice(0, eq)) === AUTH_TOKEN_PARAM) {
      if (value === null && eq !== -1) {
        try {
          value = decodeURIComponent(part.slice(eq + 1));
        } catch {
          value = "";
        }
      }
    } else if (part !== "") {
      kept.push(part);
    }
  }
  return { value, rest: kept.join("&") };
}

export function extractAuthToken(href: string): AuthTokenExtraction {
  const url = new URL(href);
  url.searchParams.delete(AUTH_TOKEN_PARAM);
  const state = url.searchParams.get(STATE_PARAM);
  url.searchParams.delete(STATE_PARAM);
  const fragment = readFragmentToken(url.hash);
  url.hash = fragment.rest;

  const candidate = fragment.value || null;
  const rejected = candidate !== null && candidate.length > MAX_AUTH_TOKEN_LENGTH;
  return {
    token: candidate !== null && !rejected ? candidate : null,
    state,
    rejected,
    cleanedPath: url.pathname + url.search + url.hash,
  };
}

/** authToken(クエリ・フラグメントの両方。クエリの値は使わない)を取り除いた絶対URL */
export function stripAuthToken(href: string): string {
  return new URL(href).origin + extractAuthToken(href).cleanedPath;
}
