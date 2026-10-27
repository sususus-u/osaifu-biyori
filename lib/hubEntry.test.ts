// 実行: npm test(Node 標準のテスト機能。追加の部品は不要)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHomeEntryLoginUrl, hasAuthTokenInUrl, planHomeEntry, stripEntry } from "./hubEntry.ts";
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
