// ログインの受け取りの部品の写し(lib/login-handoff.ts。正本はハブ。依頼347 仕事2)のテスト。
// 部品そのもののテストはハブにある。ここでは、写しを手で直していないことと、おさいふびよりでの使い方を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  goToHubLogin,
  handoffFailedMessage,
  HUB_ACCOUNT_MENU_LABEL,
  HUB_ACCOUNT_URL,
  LOGIN_HANDOFF_PRESETS,
  receiveLogin,
  recheckSession,
  stateKey,
  STATE_MARK_URL,
  type HandoffEnv,
  type KeyStore,
} from "./login-handoff.ts";

const COPY_PATH = new URL("./login-handoff.ts", import.meta.url);
const versionOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("写しを手で直していない(頭の「写しの中身の版」と、中身が合う)", () => {
  const text = readFileSync(COPY_PATH, "utf8").replace(/\r\n/g, "\n");
  const m = /^\/\/ 正本の版: ([0-9a-f]{16}) \/ 写しの中身の版: ([0-9a-f]{16})$/m.exec(text);
  assert.ok(m, "写しの頭に、版の行がない");
  // 頭の3行と空行1行のあとが、正本そのまま
  const lines = text.split("\n");
  assert.equal(lines[3], "", "頭の3行のあとに空行がない");
  const body = lines.slice(4).join("\n");
  assert.equal(versionOf(body), m[2], "写しが正本と違う。ハブで node scripts/login-handoff-copy.mjs を実行して写し直す");
});

const OSAIFU = LOGIN_HANDOFF_PRESETS.osaifu;
const BASE = "https://osaifu.okizukibiyori.com";
const NOW = 1_800_000_000_000;

test("おさいふびよりのキーは、写す前の値のまま(往復の途中の人が困らないように)", () => {
  assert.equal(OSAIFU.serviceName, "おさいふびより");
  assert.equal(OSAIFU.stateKeyPrefix, "tamari:hubLoginState:");
  assert.equal(OSAIFU.redirectCountKey, "tamari:hubLoginRedirects");
  assert.equal(OSAIFU.markService, "tamari-biyori");
});

test("言葉: 失敗の文と、メニューの「アカウント（ホーム）」のつなぎ先", () => {
  assert.equal(handoffFailedMessage(OSAIFU.serviceName), "ログインを引き継げませんでした。おさいふびよりを閉じて、もう一度開いてください");
  assert.equal(HUB_ACCOUNT_MENU_LABEL, "アカウント（ホーム）");
  assert.equal(HUB_ACCOUNT_URL, "https://okizukibiyori.com/account?open=account");
});

function memoryStore(init: Record<string, string> = {}): KeyStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => Array.from(data.keys())[i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

type Fake = HandoffEnv & {
  log: string[];
  navigated: { url: string; how: string }[];
  addresses: string[];
  beacons: string[];
  user: { isAnonymous: boolean; getIdToken: () => Promise<string> } | null;
};

function fakeEnv(href: string, opts: { user?: Fake["user"]; local?: KeyStore; session?: KeyStore } = {}): Fake {
  const env: Fake = {
    log: [],
    navigated: [],
    addresses: [],
    beacons: [],
    user: opts.user ?? null,
    config: OSAIFU,
    href,
    local: opts.local ?? memoryStore(),
    session: opts.session ?? memoryStore(),
    replaceAddress: (path) => void env.addresses.push(path),
    navigate: (url, how) => void env.navigated.push({ url, how }),
    authStateReady: async () => {},
    getUser: () => env.user,
    signInWithToken: async () => {
      env.log.push("signIn");
    },
    signOut: async () => {
      env.log.push("signOut");
      env.user = null;
    },
    clearUserData: () => void env.log.push("clear"),
    sendBeacon: (url, body) => {
      env.beacons.push(url + " " + body);
      return true;
    },
    now: () => NOW,
    random: (b) => b.fill(0xab),
  };
  return env;
}

const ST = "ab".repeat(16);
const validUser = { isAnonymous: false, getIdToken: async () => "id" };
const revokedUser = {
  isAnonymous: false,
  getIdToken: async (): Promise<string> => {
    throw { code: "auth/user-token-expired" };
  },
};

test("写す前の版で控えた合言葉({ state, at })で戻ってきても、ログインできる", async () => {
  const local = memoryStore({ [stateKey(OSAIFU, ST)]: JSON.stringify({ state: ST, at: NOW - 1000 }) });
  const env = fakeEnv(`${BASE}/reports?state=${ST}#authToken=tok`, { local });
  assert.deepEqual(await receiveLogin(env), { kind: "signed-in" });
  assert.deepEqual(env.log, ["signIn"]);
  assert.deepEqual(env.addresses, ["/reports"]);
  assert.equal(local.data.size, 0, "控えは使ったら消える");
});

test("合言葉のないトークンは使わない。ログインしていなければ、ホームのログインへ(仕事1 と同じ動き)", async () => {
  const env = fakeEnv(`${BASE}/#authToken=tok`);
  assert.deepEqual(await receiveLogin(env), { kind: "navigating" });
  assert.deepEqual(env.log, []);
  assert.deepEqual(env.beacons, [`${STATE_MARK_URL} {"service":"tamari-biyori","kind":"no-state"}`]);
  assert.equal(env.navigated.length, 1);
  const login = new URL(env.navigated[0].url);
  assert.equal(login.origin + login.pathname, "https://okizukibiyori.com/login");
  const back = new URL(login.searchParams.get("return")!);
  assert.equal(back.origin, BASE);
  assert.equal(back.searchParams.get("state"), ST);
});

test("合言葉のないトークン: ログイン済みなら、今のアカウントのまま", async () => {
  const env = fakeEnv(`${BASE}/#authToken=tok`, { user: validUser });
  assert.deepEqual(await receiveLogin(env), { kind: "none" });
  assert.deepEqual(env.log, []);
  assert.equal(env.navigated.length, 0);
});

test("合言葉が合わないときは使わず、印を送って失敗にする", async () => {
  const env = fakeEnv(`${BASE}/?state=${"cd".repeat(16)}#authToken=tok`);
  assert.deepEqual(await receiveLogin(env), { kind: "failed", reason: "mismatch" });
  assert.deepEqual(env.log, []);
  assert.deepEqual(env.beacons, [`${STATE_MARK_URL} {"service":"tamari-biyori","kind":"mismatch"}`]);
});

test("ホームのカード(?entry=home): ログイン済みで有効なら、ホームへ行かず、entry を外すだけ", async () => {
  const env = fakeEnv(`${BASE}/?entry=home`, { user: validUser });
  assert.deepEqual(await receiveLogin(env), { kind: "none" });
  assert.equal(env.navigated.length, 0);
  assert.deepEqual(env.addresses, ["/"]);
});

test("ログインが切れていたら、自動でホームのログインへ。1回の起動で1回まで(往復しない)", () => {
  const session = memoryStore();
  const env = fakeEnv(`${BASE}/`, { session });
  assert.equal(goToHubLogin(env), true);
  assert.equal(goToHubLogin(env), false);
  assert.equal(env.navigated.length, 1);
  assert.equal(session.data.get("tamari:hubLoginRedirects"), "1");
});

test("ホームでログアウトされていたら(確かめ直し)、この端末でログアウトし、データを消して、ホームのログインへ", async () => {
  const env = fakeEnv(`${BASE}/menu`, { user: revokedUser });
  assert.equal(await recheckSession(env), "navigating");
  assert.deepEqual(env.log, ["signOut", "clear"]);
  assert.equal(env.navigated[0].how, "replace");
});

test("おさいふびよりのつなぎ方: 受け取りは写した部品だけ。開いたときと、戻ったときに確かめる", () => {
  const fb = read("./firebase.ts");
  assert.ok(fb.includes("config: LOGIN_HANDOFF_PRESETS.osaifu,"));
  assert.ok(fb.includes("await receiveLogin(handoffEnv())"));
  assert.ok(fb.includes("clearUserData: clearUserLocalData,"));
  // 古い受け取りの部品は使わない
  for (const old of ["./authToken", "./handoffState", "./hubEntry", "./hubLogin", "./stateMark"]) {
    assert.ok(!fb.includes(`@/lib/${old.slice(2)}"`), old);
  }
  const provider = read("../contexts/AuthProvider.tsx");
  assert.ok(provider.includes("startSessionWatch({ target: document, check: () => recheckSession(handoffEnv()) })"));
  assert.ok(provider.includes("handoffReady.then("));
  assert.ok(provider.includes('setHandoffFailed(result.kind === "failed")'));
});
