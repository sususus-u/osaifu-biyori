// 名前の候補から種類・タイプなどの初期値を入れるのは、新しく登録するときだけ(依頼260)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { candidateDefaults } from "./candidateDefaults.ts";

type C = "electronic_money" | "points" | "gift_certificate" | "other";
type T = "finite" | "continuous";

const deps = {
  knownNames: ["PayPay残高", "PayPayポイント", "PayPayポイント(期間限定)", "切手"],
  guess: (n: string): { category: C; isYenBased: boolean } =>
    n.endsWith("残高")
      ? { category: "electronic_money", isYenBased: true }
      : n === "切手"
        ? { category: "gift_certificate", isYenBased: true }
        : { category: "points", isYenBased: true },
  categoryDefaults: {
    electronic_money: { type: "continuous", notificationDaysBefore: [90, 21] },
    points: { type: "continuous", notificationDaysBefore: [90, 21] },
    gift_certificate: { type: "finite", notificationDaysBefore: [90, 21] },
    other: { type: "finite", notificationDaysBefore: [30, 7] },
  } as Record<C, { type: T; notificationDaysBefore: [number, number] }>,
  unitDefaults: { electronic_money: "円", points: "pt", gift_certificate: "円" } as Partial<Record<C, string>>,
};

test("新しく登録するとき: 候補と同じ名前なら、候補の種類・タイプ・通知・単位を返す", () => {
  assert.deepEqual(candidateDefaults("PayPay残高", false, deps), {
    category: "electronic_money",
    isYenBased: true,
    type: "continuous",
    firstStageDays: 90,
    secondStageDays: 21,
    unit: "円",
  });
  assert.equal(candidateDefaults("PayPayポイント(期間限定)", false, deps)?.unit, "pt");
});

test("編集の画面: 保存した名前が候補と同じでも、何も返さない(保存した種類・タイプを上書きしない)", () => {
  for (const n of deps.knownNames) {
    assert.equal(candidateDefaults(n, true, deps), null, n);
  }
});

test("候補にない名前は、新しく登録するときも何も返さない(かっこの形が違う名前も別物)", () => {
  assert.equal(candidateDefaults("", false, deps), null);
  assert.equal(candidateDefaults("マイポイント", false, deps), null);
  assert.equal(candidateDefaults("PayPayポイント（期間限定）", false, deps), null);
});

test("単位の初期値がない種類は unit: null(今の単位を残す)", () => {
  const d = { ...deps, knownNames: ["その他の券"], guess: () => ({ category: "other" as C, isYenBased: false }) };
  assert.equal(candidateDefaults("その他の券", false, d)?.unit, null);
});

test("編集の画面のフォームは、候補の初期値を isEditMode を通して決める(読み込みのあとに上書きしない)", () => {
  const src = readFileSync(new URL("../components/AccountForm.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("candidateDefaults(name, isEditMode, {"));
  assert.ok(!src.includes("if (!KNOWN_ACCOUNT_NAMES.includes(name)) return;"));
  // 候補から種類を推す所は、この1か所だけ
  assert.equal(src.split("guessServiceInfo(").length - 1, 1);
});
