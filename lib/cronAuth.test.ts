import { test } from "node:test";
import assert from "node:assert/strict";
import { isCronAuthorized } from "./cronAuth.ts";

test("CRON_SECRET が未設定なら、「Bearer undefined」でも断る", () => {
  assert.equal(isCronAuthorized("Bearer undefined", undefined), false);
  assert.equal(isCronAuthorized(null, undefined), false);
  assert.equal(isCronAuthorized("Bearer ", ""), false);
});

test("合言葉が合うときだけ通す", () => {
  assert.equal(isCronAuthorized("Bearer right-secret", "right-secret"), true);
  assert.equal(isCronAuthorized("Bearer wrong-secret", "right-secret"), false);
  assert.equal(isCronAuthorized(null, "right-secret"), false);
});
