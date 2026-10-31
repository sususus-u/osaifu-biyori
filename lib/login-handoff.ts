// 写し(手で書き換えない)。正本: ハブ(okizukibiyori-hub)の src/lib/login-handoff.ts
// 正本の版: 1a2c03f6586bb9cd / 写しの中身の版: 1a2c03f6586bb9cd
// 正本を直したら、ハブで node scripts/login-handoff-copy.mjs を実行して写し直す(依頼347 仕事2)。

// ホーム(おきづきびより)のログインを、サービスが受け取る部品(依頼347 仕事2。依頼345 の決定7)。ハブが正本。
// 3つのサービスへ写す(scripts/login-handoff-copy.mjs。写しの頭に、正本の版を書く。plan-resolve と同じ仕組み)。
// そのため、この中では、ほかのファイルを import しない。Firebase・window・storage は、引数で受け取る。
//
// 流れ(BRAND.md 25章 案0、26章 依頼264・依頼272):
// 1. サービスは、ログインしていなければ、合言葉(state)を作って localStorage に控え、
//    ホームの /login?return=<今のURL + ?state=> へ移る(goToHubLogin)。1回の起動(タブ)で1回まで(往復の歯止め)。
// 2. ホームは、ログインのあと、戻り先(許可の一覧と完全一致のものだけ)に #authToken= を付けて戻す。
// 3. サービスは、# の authToken と ? の state を読み、アドレスから取り除き、控えと照合して、
//    合ったときだけ、そのトークンでログインする(receiveLogin)。合言葉のないトークンは使わない(依頼264の2回目)。
// 4. ホームのカード・招待は ?entry=home を付けて開く。ログイン済みで有効なら、ホームへ行かない(依頼272)。
// 5. ホームでログアウトすると、すべての端末のログインが取り消される。サービスは、開いたときと、
//    30分以上たって画面に戻ったときに、ログインがまだ有効かを確かめる(startSessionWatch。依頼345 の決定4)。
//
// 値(トークン・合言葉)は、ログ・画面・エラーに出さない。
//
// 新しいサービスを足すとき(依頼345 の決定7):
// 1. ハブの src/lib/return-url.ts の LOGIN_SERVICES に1行(オリジンと名前。招待があれば、その形)。
// 2. 下の LOGIN_HANDOFF_PRESETS に1行(控えのキーの頭は、新しいサービスの名前で)。
// 3. ハブで node scripts/login-handoff-copy.mjs を実行して写す(写す先は、そのスクリプトに1行足す)。
// 4. サービスは、Firebase の初期化のすぐあとで receiveLogin を呼び、画面は、その結果を待ってから出す
//    (使い方の例は docs/login-handoff.md)。
// 印(markService)は、依頼264 の数えのためのもの。新しいサービスは、付けなくてよい。

// --- 決まった値 ---

export const HUB_ORIGIN = "https://okizukibiyori.com";
export const HUB_LOGIN_URL = `${HUB_ORIGIN}/login`;
/** サービスのメニューの「アカウント（ホーム）」の行のつなぎ先(ホームのメニューの、アカウントの欄を開いた形) */
export const HUB_ACCOUNT_URL = `${HUB_ORIGIN}/account?open=account`;
export const HUB_ACCOUNT_MENU_LABEL = "アカウント（ホーム）";
export const STATE_MARK_URL = `${HUB_ORIGIN}/api/auth-state-mark`;

/** ログインのボタンの言葉(BRAND.md 3章。依頼345 の決定1) */
export const LOGIN_BUTTON_LABEL = "おきづきびよりにログイン";

export const AUTH_TOKEN_PARAM = "authToken";
export const STATE_PARAM = "state";
export const ENTRY_PARAM = "entry";
export const ENTRY_HOME = "home";

// Firebase のカスタムトークンは数KB に収まる。長すぎる値は読まずに断る
export const MAX_AUTH_TOKEN_LENGTH = 4096;
export const STATE_BYTES = 16;
const STATE_KEY_CHARS = 8;
// 作る合言葉は16進32文字。受け取るのは16進8〜64文字だけ(ほかは比べずに断る)
const STATE_PATTERN = /^[0-9a-f]{8,64}$/;
/** 合言葉の控えの有効期間(10分) */
export const STATE_TTL_MS = 10 * 60 * 1000;
/** 1回の起動(タブ)で、ホームのログインへ移ってよい回数 */
export const MAX_REDIRECTS_PER_SESSION = 1;
/** ログインの確かめ(getIdToken(true))を待つ長さ。過ぎたら通信の失敗と同じに扱う */
export const SESSION_CHECK_TIMEOUT_MS = 10_000;
/** 画面に戻ったとき、前の確かめからこれ以上たっていたら、確かめ直す(30分。依頼345 の決定4) */
export const SESSION_RECHECK_MS = 30 * 60 * 1000;

/** ログインが取り消された・切れた・アカウントがないことを表すエラー(ホームでのログアウトなど) */
export const REVOKED_SESSION_ERROR_CODES: readonly string[] = [
  "auth/user-token-expired",
  "auth/user-disabled",
  "auth/user-not-found",
  "auth/invalid-user-token",
];

// --- サービスごとの設定 ---

export type LoginHandoffConfig = {
  /** 画面に出すサービスの名前(失敗の文など) */
  serviceName: string;
  /** 合言葉の控えのキーの頭(localStorage)。今のサービスの値と同じにする(往復の途中の人が困らないように) */
  stateKeyPrefix: string;
  /** ホームへ移った回数の数えのキー(sessionStorage) */
  redirectCountKey: string;
  /** ホームへ送る印の識別子(依頼264)。null なら送らない */
  markService: string | null;
};

// キーの名前は、写す前の各サービスの値のまま(内部の識別子は旧名のまま。CLAUDE.md「名前の決まり」)
export const LOGIN_HANDOFF_PRESETS = {
  mamori: {
    serviceName: "まもりびより",
    stateKeyPrefix: "mamori:hubLoginState:",
    redirectCountKey: "mamori:hubLoginRedirects",
    markService: "mamori-biyori",
  },
  tabe: {
    serviceName: "たべびより",
    stateKeyPrefix: "tabegoro:hubLoginState:",
    redirectCountKey: "tabe:hubLoginRedirects",
    markService: "tabe-biyori",
  },
  osaifu: {
    serviceName: "おさいふびより",
    stateKeyPrefix: "tamari:hubLoginState:",
    redirectCountKey: "tamari:hubLoginRedirects",
    markService: "tamari-biyori",
  },
} as const satisfies Record<string, LoginHandoffConfig>;

/** ログインを引き継げなかったときの文(BRAND.md 3章) */
export function handoffFailedMessage(serviceName: string): string {
  return `ログインを引き継げませんでした。${serviceName}を閉じて、もう一度開いてください`;
}

// --- 受け取る形(window・Storage・Firebase の User の、使う所だけ) ---

/** localStorage・sessionStorage の、使う所だけ */
export type KeyStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

/** Firebase の User の、使う所だけ */
export type SessionUser = {
  isAnonymous: boolean;
  getIdToken(forceRefresh?: boolean): Promise<string>;
};

export type RandomFill = (bytes: Uint8Array) => Uint8Array;

const defaultRandom: RandomFill = (bytes) => crypto.getRandomValues(bytes);

// --- アドレスの読み取り ---

export type HandoffRead = {
  /** # の後ろの authToken。なし・空・長すぎる・読めないときは null */
  token: string | null;
  /** ? の後ろの state。なし・空なら null */
  state: string | null;
  /** authToken はあったが使えない(長すぎる・読めない) */
  rejected: boolean;
  /** authToken が(? でも # でも)付いていたか */
  hasToken: boolean;
  /** ? の後ろに entry=home があるか(ホームのカード・招待から開かれた) */
  entryHome: boolean;
  /** authToken・state・entry を取り除いた「パス+クエリ+フラグメント」(history.replaceState 用) */
  cleanedPath: string;
};

function splitFragment(hash: string): { value: string | null; present: boolean; rest: string } {
  const kept: string[] = [];
  let value: string | null = null;
  let present = false;
  for (const part of hash.replace(/^#/, "").split("&")) {
    const eq = part.indexOf("=");
    if ((eq === -1 ? part : part.slice(0, eq)) === AUTH_TOKEN_PARAM) {
      if (!present) value = eq === -1 ? "" : part.slice(eq + 1);
      present = true;
    } else if (part !== "") {
      kept.push(part);
    }
  }
  return { value, present, rest: kept.join("&") };
}

function cleanUrl(href: string): { url: URL; fragment: ReturnType<typeof splitFragment>; queryToken: boolean; state: string | null; entryHome: boolean } {
  const url = new URL(href);
  // ? の authToken は、履歴やログに残りやすいので、読まずに取り除くだけ
  const queryToken = url.searchParams.has(AUTH_TOKEN_PARAM);
  url.searchParams.delete(AUTH_TOKEN_PARAM);
  const state = url.searchParams.get(STATE_PARAM) || null;
  url.searchParams.delete(STATE_PARAM);
  const entryHome = url.searchParams.getAll(ENTRY_PARAM).includes(ENTRY_HOME);
  url.searchParams.delete(ENTRY_PARAM);
  const fragment = splitFragment(url.hash);
  url.hash = fragment.rest;
  return { url, fragment, queryToken, state, entryHome };
}

/** 開かれたアドレスから、引き継ぎに使うものを読む(値は出力しない) */
export function readHandoff(href: string): HandoffRead {
  const { url, fragment, queryToken, state, entryHome } = cleanUrl(href);
  let decoded: string | null = null;
  if (fragment.value) {
    try {
      decoded = decodeURIComponent(fragment.value);
    } catch {
      decoded = null;
    }
  }
  const rejected = fragment.value !== null && fragment.value !== "" && (decoded === null || decoded.length > MAX_AUTH_TOKEN_LENGTH);
  return {
    token: decoded && !rejected ? decoded : null,
    state,
    rejected,
    hasToken: queryToken || fragment.present,
    entryHome,
    cleanedPath: url.pathname + url.search + url.hash,
  };
}

/** 戻り先に使う、今のアドレス(authToken・state・entry を取り除いた絶対URL。join などほかの部分は残す) */
export function stripHandoffParams(href: string): string {
  const { url } = cleanUrl(href);
  return url.toString();
}

/** ホームのログインのURL。戻り先は、今のアドレスから引き継ぎの印を外し、?state= を足したもの */
export function buildHubLoginUrl(href: string, state: string): string {
  const back = new URL(stripHandoffParams(href));
  back.searchParams.set(STATE_PARAM, state);
  return `${HUB_LOGIN_URL}?return=${encodeURIComponent(back.toString())}`;
}

// --- 合言葉(state) ---

/** 乱数(16バイト、16進32文字) */
export function generateState(random: RandomFill = defaultRandom): string {
  const bytes = random(new Uint8Array(STATE_BYTES));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 時間一定の比較(長さが違うときは、先に false) */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function stateKey(config: Pick<LoginHandoffConfig, "stateKeyPrefix">, state: string): string {
  return config.stateKeyPrefix + state.slice(0, STATE_KEY_CHARS);
}

// 控えの中身。時刻は、まもりびより・おさいふびよりの at と、たべびよりの savedAt の、どちらでも読む
// (写す前の版で控えた人が、写したあとの版で戻ってきても、照合できるように)
function parseEntry(raw: string | null, now: number): string | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as { state?: unknown; at?: unknown; savedAt?: unknown };
    const at = typeof v.at === "number" ? v.at : typeof v.savedAt === "number" ? v.savedAt : NaN;
    if (typeof v.state !== "string" || !Number.isFinite(at)) return null;
    if (at > now || now - at > STATE_TTL_MS) return null;
    return v.state;
  } catch {
    return null;
  }
}

/** 期限切れ(10分より古い)や壊れた控えを消す。新しい控えは残す */
export function sweepStates(config: Pick<LoginHandoffConfig, "stateKeyPrefix">, store: KeyStore, now: number = Date.now()): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null && key.startsWith(config.stateKeyPrefix) && parseEntry(store.getItem(key), now) === null) stale.push(key);
    }
    for (const key of stale) store.removeItem(key);
  } catch {
    // 掃除できなくても、ログインには影響しない
  }
}

/** 新しい合言葉を作って控える。控えられなければ null(ホームへは移らない) */
export function issueState(
  config: Pick<LoginHandoffConfig, "stateKeyPrefix">,
  store: KeyStore | null,
  now: number = Date.now(),
  random: RandomFill = defaultRandom,
): string | null {
  if (!store) return null;
  try {
    sweepStates(config, store, now);
    const state = generateState(random);
    // at と savedAt の両方を書く(写す前の版の画面が、まだ残っている端末でも読めるように)
    store.setItem(stateKey(config, state), JSON.stringify({ state, at: now, savedAt: now }));
    return state;
  } catch {
    return null;
  }
}

/**
 * 受け取った合言葉を照合する。受け取った合言葉の控えは、結果によらず消す(使い回せない)。
 * 合う(控えがあり、一致し、10分以内)ときだけ true。null・形が違う・控えなし・不一致・期限切れは false。
 */
export function consumeState(
  config: Pick<LoginHandoffConfig, "stateKeyPrefix">,
  received: string | null,
  store: KeyStore | null,
  now: number = Date.now(),
): boolean {
  if (!store) return false;
  sweepStates(config, store, now);
  if (received === null || !STATE_PATTERN.test(received)) return false;
  let saved: string | null = null;
  try {
    const key = stateKey(config, received);
    saved = parseEntry(store.getItem(key), now);
    store.removeItem(key);
  } catch {
    return false;
  }
  return saved !== null && safeEqual(received, saved);
}

// --- 使うか断るかの判断 ---

export type HandoffDecision =
  /** トークンがない。何もしない */
  | "none"
  /** 合言葉が控えと合わない(攻撃者のリンクの疑い)。使わない。印を送る */
  | "mismatch"
  /** トークンが長すぎる・読めない。使わない */
  | "rejected"
  /** 合言葉のないトークン。使わない。印を送り、ログインしていなければホームのログインへ(依頼264の2回目) */
  | "no-state"
  /** 合言葉が合った。そのトークンでログインする */
  | "signIn";

/** stateOk = consumeState の結果。照合の失敗を、値の不正より先に見る(印の数え方を、今までと変えないため) */
export function decideHandoff(read: Pick<HandoffRead, "token" | "state" | "rejected">, stateOk: boolean): HandoffDecision {
  if (read.token === null && !read.rejected) return "none";
  if (read.state !== null && !stateOk) return "mismatch";
  if (read.rejected) return "rejected";
  if (read.state === null) return "no-state";
  return "signIn";
}

// --- ログインが有効かの確かめ ---

/** 確かめた結果。null = ログインしていない */
export type SessionCheck = null | { ok: true } | { ok: false; code: string };

export type SessionDecision =
  /** ログイン済みで有効(または、通信の失敗などで確かめられない)。そのまま使う */
  | "keep"
  /** ログインしていない。ホームのログインへ */
  | "toHub"
  /** ログインが取り消されていた。この端末でログアウトし、端末のデータを消してから、ホームのログインへ */
  | "signOutThenToHub";

/** 通信の失敗(auth/network-request-failed)・時間切れ・そのほかのエラーは、ログイン済みとして進む(電波のない所でも使えるように) */
export function decideSession(check: SessionCheck): SessionDecision {
  if (check === null) return "toHub";
  if (check.ok) return "keep";
  if (REVOKED_SESSION_ERROR_CODES.includes(check.code)) return "signOutThenToHub";
  return "keep";
}

/** ログインを、通信して確かめる。保存済みの IDトークンではなく、必ず取り直す(ホームでの取り消しに気づくため) */
export async function checkSession(user: SessionUser | null, timeoutMs: number = SESSION_CHECK_TIMEOUT_MS): Promise<SessionCheck> {
  if (!user || user.isAnonymous) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      user.getIdToken(true),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject({ code: "auth/network-request-failed" }), timeoutMs);
      }),
    ]);
    return { ok: true };
  } catch (error) {
    // エラーの中身は出さず、種類(code)だけ使う
    const code = (error as { code?: unknown } | null)?.code;
    return { ok: false, code: typeof code === "string" ? code : "unknown" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** 画面に戻ったとき、確かめ直すか(前の確かめから30分以上。確かめたことがなければ確かめる) */
export function shouldRecheckSession(lastCheckedAt: number | null, now: number): boolean {
  return lastCheckedAt === null || now - lastCheckedAt >= SESSION_RECHECK_MS;
}

// --- 往復の歯止め(1回の起動で1回) ---

/** ホームへ移ってよいか。よければ数えを1つ増やして true。上限に届いた・数えられないときは false(往復しない) */
export function takeRedirect(config: Pick<LoginHandoffConfig, "redirectCountKey">, session: KeyStore | null): boolean {
  if (!session) return false;
  try {
    const raw = session.getItem(config.redirectCountKey);
    const count = raw === null ? 0 : Number(raw);
    if (!Number.isFinite(count) || count >= MAX_REDIRECTS_PER_SESSION) return false;
    session.setItem(config.redirectCountKey, String(count + 1));
    return true;
  } catch {
    return false;
  }
}

/** ログインできたとき、次の機会(ログアウトのあとなど)のために数えを戻す */
export function resetRedirectCount(config: Pick<LoginHandoffConfig, "redirectCountKey">, session: KeyStore | null): void {
  try {
    session?.removeItem(config.redirectCountKey);
  } catch {
    // 使えなくても、ログインには影響しない
  }
}

// --- 印(依頼264) ---

export type StateMarkKind = "no-state" | "mismatch";

export function buildStateMarkBody(markService: string, kind: StateMarkKind): string {
  return JSON.stringify({ service: markService, kind });
}

/** 印を送る(文字列で送るので text/plain になり、事前の確認の通信が起きない)。送れなくても何もしない */
export function sendStateMark(
  config: Pick<LoginHandoffConfig, "markService">,
  kind: StateMarkKind,
  sendBeacon: ((url: string, body: string) => boolean) | undefined,
): void {
  if (!config.markService || !sendBeacon) return;
  try {
    sendBeacon(STATE_MARK_URL, buildStateMarkBody(config.markService, kind));
  } catch {
    // 送れなくても、ログインには影響しない
  }
}

// --- 流れ(サービスは、これを呼ぶ) ---

export type HandoffEnv = {
  config: LoginHandoffConfig;
  /** 今のアドレス(window.location.href) */
  href: string;
  /** window.localStorage(使えなければ null) */
  local: KeyStore | null;
  /** window.sessionStorage(使えなければ null) */
  session: KeyStore | null;
  /** アドレスを書き換える(history.replaceState(null, "", path)) */
  replaceAddress(path: string): void;
  /** 移る(location.assign / location.replace) */
  navigate(url: string, how: "assign" | "replace"): void;
  /** 端末に残っているログインの読み込みを待つ(auth.authStateReady()) */
  authStateReady(): Promise<void>;
  /** 今のログイン(auth.currentUser) */
  getUser(): SessionUser | null;
  /** signInWithCustomToken(auth, token) */
  signInWithToken(token: string): Promise<unknown>;
  /** signOut(auth) */
  signOut(): Promise<void>;
  /** この端末の、ユーザー固有のデータを消す(ログアウトと同じ) */
  clearUserData(): void | Promise<void>;
  /** navigator.sendBeacon(なければ印を送らない) */
  sendBeacon?: (url: string, body: string) => boolean;
  now?: () => number;
  random?: RandomFill;
  sessionCheckTimeoutMs?: number;
};

export type ReceiveResult =
  /** 引き継ぎはなかった(または、ログイン済みのまま使う)。今のログインの状態で画面を出す */
  | { kind: "none" }
  /** トークンでログインした */
  | { kind: "signed-in" }
  /** ホームのログインへ移っている。画面を出さずに待つ */
  | { kind: "navigating" }
  /** 引き継げなかった。ログインしていなければ、handoffFailedMessage の画面を出す */
  | { kind: "failed"; reason: "mismatch" | "rejected" | "no-state" | "sign-in-failed" };

const nowOf = (env: Pick<HandoffEnv, "now">): number => (env.now ? env.now() : Date.now());

/**
 * ホームのログインへ移る(ログインが切れていたとき、自動で。依頼345 の決定2)。移ったら true。
 * 1回の起動で1回まで。上限・storage が使えない・合言葉を控えられないときは false(呼び出し元は、失敗の画面を出す)。
 */
export function goToHubLogin(
  env: Pick<HandoffEnv, "config" | "href" | "local" | "session" | "navigate" | "now" | "random">,
  how: "assign" | "replace" = "assign",
): boolean {
  if (!takeRedirect(env.config, env.session)) return false;
  const state = issueState(env.config, env.local, nowOf(env), env.random);
  if (state === null) return false;
  env.navigate(buildHubLoginUrl(env.href, state), how);
  return true;
}

/**
 * ホームのカード・招待(?entry=home)から、ホームのログインへ移る。移ったら true。
 * 戻り先から entry を外すので往復しない。そのため、上の数えは使わない・増やさない(あとの自動の移動を止めないため)。
 * 入口のアドレスを履歴に残さないよう、replace で移る。
 */
export function goToHubLoginFromEntry(env: Pick<HandoffEnv, "config" | "href" | "local" | "navigate" | "now" | "random">): boolean {
  const state = issueState(env.config, env.local, nowOf(env), env.random);
  if (state === null) return false;
  env.navigate(buildHubLoginUrl(env.href, state), "replace");
  return true;
}

async function currentSession(env: Pick<HandoffEnv, "authStateReady" | "getUser" | "sessionCheckTimeoutMs">): Promise<SessionCheck> {
  try {
    await env.authStateReady();
  } catch {
    // 読み込みに失敗しても、今のログインを見て進む
  }
  return checkSession(env.getUser(), env.sessionCheckTimeoutMs);
}

async function signOutHere(env: Pick<HandoffEnv, "signOut" | "clearUserData">): Promise<void> {
  try {
    await env.signOut();
  } catch {
    // ログアウトできなくても、ホームから戻ったトークンでログインし直す
  }
  try {
    await env.clearUserData();
  } catch {
    // 消せなくても進む
  }
}

/**
 * 開いたときに1回だけ呼ぶ(Firebase の初期化のすぐあと。ログイン状態の判定は、この結果を待ってから)。
 * - ?entry=home(トークンなし): ログイン済みで有効なら、そのまま。していない・取り消されていたら、ホームのログインへ。
 * - #authToken=: 合言葉を照合して、合えばログイン。合言葉がなければ使わず、ログインしていなければホームのログインへ。
 * どの場合も、authToken・state・entry はアドレスから取り除く(ホームへ移るときを除く)。
 */
export async function receiveLogin(env: HandoffEnv): Promise<ReceiveResult> {
  const read = readHandoff(env.href);

  if (read.entryHome && !read.hasToken) {
    const decision = decideSession(await currentSession(env));
    if (decision !== "keep") {
      if (decision === "signOutThenToHub") await signOutHere(env);
      if (goToHubLoginFromEntry(env)) return { kind: "navigating" };
    }
  }

  const current = new URL(env.href);
  if (read.cleanedPath !== current.pathname + current.search + current.hash) {
    try {
      env.replaceAddress(read.cleanedPath);
    } catch {
      // 書き換えられなくても、ログインは進める
    }
  }

  let stateOk = false;
  if (read.state !== null) {
    try {
      stateOk = consumeState(env.config, read.state, env.local, nowOf(env));
    } catch {
      stateOk = false;
    }
  }

  const decision = decideHandoff(read, stateOk);
  if (decision === "none") return { kind: "none" };
  if (decision === "mismatch") {
    sendStateMark(env.config, "mismatch", env.sendBeacon);
    return { kind: "failed", reason: "mismatch" };
  }
  if (decision === "rejected") return { kind: "failed", reason: "rejected" };
  if (decision === "no-state") {
    // 合言葉のないトークンは使わない(攻撃者が自分のトークンを付けたリンクで、アカウントが入れ替わらないように)
    sendStateMark(env.config, "no-state", env.sendBeacon);
    const session = decideSession(await currentSession(env));
    if (session === "keep") return { kind: "none" };
    if (session === "signOutThenToHub") await signOutHere(env);
    if (goToHubLogin(env, "replace")) return { kind: "navigating" };
    return { kind: "failed", reason: "no-state" };
  }

  if (read.token === null) return { kind: "failed", reason: "rejected" };
  try {
    await env.signInWithToken(read.token);
  } catch {
    return { kind: "failed", reason: "sign-in-failed" };
  }
  resetRedirectCount(env.config, env.session);
  return { kind: "signed-in" };
}

export type RecheckResult =
  /** ログインしていない(呼び出し元の画面のまま) */
  | "no-user"
  /** 有効(または確かめられない)。そのまま */
  | "kept"
  /** 取り消されていたので、この端末でログアウトし、ホームのログインへ移っている */
  | "navigating"
  /** 取り消されていたので、この端末でログアウトした。ホームへは移れなかった(失敗の画面を出す) */
  | "signed-out";

/** ログインがまだ有効かを確かめ、取り消されていたら、ログアウトしてホームのログインへ移る */
export async function recheckSession(
  env: Pick<HandoffEnv, "config" | "href" | "local" | "session" | "navigate" | "getUser" | "signOut" | "clearUserData" | "now" | "random" | "sessionCheckTimeoutMs">,
): Promise<RecheckResult> {
  const check = await checkSession(env.getUser(), env.sessionCheckTimeoutMs);
  if (check === null) return "no-user";
  if (decideSession(check) !== "signOutThenToHub") return "kept";
  await signOutHere(env);
  return goToHubLogin(env, "replace") ? "navigating" : "signed-out";
}

/** document の、使う所だけ */
export type VisibilityTarget = {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

/**
 * ログインの確かめを、開いたとき(すぐ1回)と、30分以上たって画面に戻ったときに行う(依頼345 の決定4)。
 * check は、ふつう () => recheckSession(env)。画面の表示は止めない(結果を待たない)。止めるときは、返した関数を呼ぶ。
 */
export function startSessionWatch(opts: { target: VisibilityTarget; check: () => Promise<unknown>; now?: () => number }): () => void {
  const now = opts.now ?? (() => Date.now());
  let lastCheckedAt: number | null = null;
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    lastCheckedAt = now();
    opts
      .check()
      .catch(() => {
        // 確かめられなくても、画面はそのまま
      })
      .finally(() => {
        running = false;
      });
  };
  const onVisible = () => {
    if (opts.target.visibilityState === "visible" && shouldRecheckSession(lastCheckedAt, now())) run();
  };
  opts.target.addEventListener("visibilitychange", onVisible);
  run();
  return () => opts.target.removeEventListener("visibilitychange", onVisible);
}
