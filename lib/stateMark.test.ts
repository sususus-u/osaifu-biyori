// 実行: npm test(Node 標準のテスト機能。追加の部品は不要)
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATE_MARK_URL, buildStateMarkBody, sendStateMark } from "./stateMark.ts";

test("送る中身は、サービスの識別子(tamari-biyori)と種類だけの文字列", () => {
  assert.equal(buildStateMarkBody("no-state"), '{"service":"tamari-biyori","kind":"no-state"}');
  assert.deepEqual(JSON.parse(buildStateMarkBody("mismatch")), { service: "tamari-biyori", kind: "mismatch" });
});
test("sendBeacon にハブの受け口と文字列を渡す(navigator を this にして呼ぶ)", () => {
  const calls: unknown[][] = [];
  const nav = {
    sendBeacon(this: unknown, url: string, data?: string) {
      calls.push([this === nav, url, typeof data, data]);
      return true;
    },
  };
  sendStateMark("no-state", nav);
  assert.deepEqual(calls, [[true, STATE_MARK_URL, "string", buildStateMarkBody("no-state")]]);
  assert.equal(STATE_MARK_URL, "https://okizukibiyori.com/api/auth-state-mark");
});
test("送れない(sendBeacon がない・例外)ときも、例外を外へ出さない", () => {
  assert.doesNotThrow(() => sendStateMark("mismatch", undefined));
  assert.doesNotThrow(() => sendStateMark("mismatch", {}));
  assert.doesNotThrow(() =>
    sendStateMark("mismatch", {
      sendBeacon: () => {
        throw new Error("x");
      },
    }),
  );
});
