// 実行: npm test(Node 標準のテスト機能。追加の部品は不要)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildHomeEntryLoginUrl,
  decideHomeEntrySession,
  hasAuthTokenInUrl,
  planHomeEntry,
  REVOKED_SESSION_ERROR_CODES,
  stripEntry,
} from "./hubEntry.ts";
import { buildHubLoginUrl } from "./hubLogin.ts";

const BASE = "https://osaifu.okizukibiyori.com";
const ST = "0123456789abcdef0123456789abcdef";

function returnOf(loginUrl: string): URL {
  const u = new URL(loginUrl);
  assert.equal(u.origin + u.pathname, "https://okizukibiyori.com/login");
  return new URL(u.searchParams.get("return")!);
}

test("entry がないときは何もしない", () => {
  assert.deepEqual(planHomeEntry(`${BASE}/`), { action: "none" });
  assert.deepEqual(planHomeEntry(`${BASE}/menu?x=1#a`), { action: "none" });
});
test("?entry=home で authToken がないときは、entry を外したURLを return にしてハブへ移動する", () => {
  assert.deepEqual(planHomeEntry(`${BASE}/?entry=home`), { action: "redirect", returnHref: `${BASE}/` });
  assert.deepEqual(planHomeEntry(`${BASE}/reports?a=1&entry=home&b=2#frag`), {
    action: "redirect",
    returnHref: `${BASE}/reports?a=1&b=2#frag`,
  });
});
test("entry と authToken の両方があるときは、entry を無視して外すだけ(フラグメント・クエリのどちらでも)", () => {
  assert.deepEqual(planHomeEntry(`${BASE}/?entry=home&state=x#authToken=abc`), {
    action: "strip",
    cleanedPath: "/?state=x#authToken=abc",
  });
  assert.equal(planHomeEntry(`${BASE}/?entry=home&authToken=abc`).action, "strip");
  assert.equal(planHomeEntry(`${BASE}/?entry=home#foo=1&authToken`).action, "strip");
});
test("entry の値が home 以外のときは、外すだけ", () => {
  assert.deepEqual(planHomeEntry(`${BASE}/?entry=other&x=1`), { action: "strip", cleanedPath: "/?x=1" });
});
test("hasAuthTokenInUrl はクエリ・フラグメントのどちらでも見つける。似た名前は数えない", () => {
  assert.equal(hasAuthTokenInUrl(`${BASE}/#authToken=a`), true);
  assert.equal(hasAuthTokenInUrl(`${BASE}/#x=1&authToken=a`), true);
  assert.equal(hasAuthTokenInUrl(`${BASE}/?authToken=a`), true);
  assert.equal(hasAuthTokenInUrl(`${BASE}/#authTokenX=a`), false);
  assert.equal(hasAuthTokenInUrl(`${BASE}/?entry=home`), false);
});
test("stripEntry は entry だけを外す(パス・ほかのクエリ・フラグメントは残す)", () => {
  assert.equal(stripEntry(`${BASE}/menu?entry=home&q=1#h`), `${BASE}/menu?q=1#h`);
  assert.equal(stripEntry(`${BASE}/?entry=home`), `${BASE}/`);
});
test("ハブのログイン画面の return は、entry を含まず ?state= を含む(往復しない)", () => {
  const ret = returnOf(buildHomeEntryLoginUrl(`${BASE}/reports?entry=home&a=1`, ST));
  assert.equal(ret.origin, BASE);
  assert.equal(ret.pathname, "/reports");
  assert.equal(ret.searchParams.get("entry"), null);
  assert.equal(ret.searchParams.get("a"), "1");
  assert.equal(ret.searchParams.get("state"), ST);
  // 戻ってきたURL(return + #authToken=)は、もう一度ハブへは出ない
  assert.notEqual(planHomeEntry(ret.toString() + "#authToken=t").action, "redirect");
  assert.equal(planHomeEntry(ret.toString()).action, "none");
});
test("buildHubLoginUrl は、古い state・authToken を return に残さない", () => {
  const ret = returnOf(buildHubLoginUrl(`${BASE}/?state=old&authToken=q#authToken=f`, ST));
  assert.equal(ret.searchParams.getAll("state").join(","), ST);
  assert.equal(ret.searchParams.get("authToken"), null);
  assert.equal(ret.hash, "");
});

// 依頼272: ログイン済みなら、ホームを通らない
test("ログイン済みで、ログインが有効なら、ハブへ出ない(entry を外して一覧を出す)", () => {
  assert.equal(decideHomeEntrySession({ ok: true }), "skip");
});
test("ログインしていないときは、state を作ってハブへ往復する", () => {
  assert.equal(decideHomeEntrySession(null), "roundTrip");
});
test("ログインが取り消された・切れた・無効・アカウントなしなら、この端末でログアウトしてから往復する", () => {
  for (const code of ["auth/user-token-expired", "auth/user-disabled", "auth/user-not-found", "auth/invalid-user-token"]) {
    assert.equal(decideHomeEntrySession({ ok: false, code }), "signOutThenRoundTrip", code);
  }
  assert.equal(REVOKED_SESSION_ERROR_CODES.length, 4);
});
test("通信の失敗(時間切れも同じ扱い)や、そのほかのエラーなら、ログイン済みとして進む", () => {
  assert.equal(decideHomeEntrySession({ ok: false, code: "auth/network-request-failed" }), "skip");
  assert.equal(decideHomeEntrySession({ ok: false, code: "auth/too-many-requests" }), "skip");
  assert.equal(decideHomeEntrySession({ ok: false, code: "unknown" }), "skip");
});
test("入口(lib/firebase.ts): 復元を待ってから、通信して確かめ、決まりに従う", () => {
  const src = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8");
  assert.ok(src.includes("await auth.authStateReady();"));
  assert.ok(src.includes("user.getIdToken(true)"));
  assert.ok(src.includes('reject({ code: "auth/network-request-failed" })'));
  assert.ok(src.includes("decideHomeEntrySession(check)"));
  assert.ok(src.includes("if (await redirectFromHomeEntry()) {"));
  // 取り消されていたときは、ログアウトして端末のデータを消してから往復する
  assert.match(src, /"signOutThenRoundTrip"\) \{[\s\S]*?await signOut\(auth\);[\s\S]*?clearUserLocalData\(\);/);
});
