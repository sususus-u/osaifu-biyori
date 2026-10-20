import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAMP_SAVED_MESSAGE_KEY,
  stashStampSavedMessage,
  takeStampSavedMessage,
  type MessageStorage,
} from "./stampToast.ts";

function fake(): MessageStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("入れた文を、読める。複数行もそのまま", () => {
  const s = fake();
  const msg = "切手 1円に5枚追加しました(合計23枚)\n切手 2円を新しく作りました(3枚)";
  stashStampSavedMessage(s, msg);
  assert.equal(s.data.get(STAMP_SAVED_MESSAGE_KEY), msg);
  assert.equal(takeStampSavedMessage(s), msg);
});

test("読んだら消える(2回目は何も出ない)", () => {
  const s = fake();
  stashStampSavedMessage(s, "x");
  assert.equal(takeStampSavedMessage(s), "x");
  assert.equal(takeStampSavedMessage(s), null);
  assert.equal(s.data.size, 0);
});

test("キーがなければ、何も出ない(読み取り以外の遷移)", () => {
  assert.equal(takeStampSavedMessage(fake()), null);
});

test("空の文は入れない・出さない", () => {
  const s = fake();
  stashStampSavedMessage(s, "  ");
  assert.equal(s.data.size, 0);
  s.setItem(STAMP_SAVED_MESSAGE_KEY, "");
  assert.equal(takeStampSavedMessage(s), null);
});

test("storage が使えない・例外でも、落ちない", () => {
  const broken: MessageStorage = {
    getItem: () => { throw new Error("x"); },
    setItem: () => { throw new Error("x"); },
    removeItem: () => { throw new Error("x"); },
  };
  assert.doesNotThrow(() => stashStampSavedMessage(broken, "x"));
  assert.equal(takeStampSavedMessage(broken), null);
  assert.equal(takeStampSavedMessage(null), null);
});
