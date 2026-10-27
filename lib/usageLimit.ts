// AI読み取り(スクショ読み取り・現物の写真読み取り)の利用回数を、
// アカウント(uid)ごとにサーバー側で数える(サーバー側専用)。1日の回数(安全弁)と月の回数の両方。
// 記録場所: usage_counts_tamari/{uid}_{日本時間の日付} と usage_counts_tamari/{uid}_{日本時間の年月}
//   { uid, date または month, ai_read_count, updated_at, expireAt }
// このアプリは、まもりびより(usage_counts_mamori)・たべびより(usage_counts_tabe)と
// 同じFirebaseプロジェクト(okizukibiyori)を使うため、コレクション名をアプリ専用にしている。
// 数えるのはAdmin SDKを使うこの処理だけで、画面からは誰も書き込めない。
// 全員の合計の1日の点数(依頼218)も、同じトランザクションで数える(lib/aiBudget.ts)。

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyBearerIdToken } from "@/lib/verifyIdToken";
import { notifyOperator } from "@/lib/operatorNotify";
import { consumeCore, refundCore } from "@/lib/usageCore";
import {
  getPlan,
  isPlanEnforced,
  jstDateString,
  jstMonthString,
  monthlyAiReadLimit,
  monthlyLimitMessage,
} from "@/lib/planLimits";
import {
  AI_BUDGET_COLLECTION,
  AI_BUDGET_CONFIG_COLLECTION,
  AI_BUDGET_CONFIG_DOC,
  AI_BUDGET_RETENTION_DAYS,
  AI_POINTS,
  DEFAULT_AI_BUDGET,
  aiBudgetLog,
  dailyPointLimit,
  parseAiBudget,
  type AiBudget,
  type AiFeature,
} from "@/lib/aiBudget";
import { aiPausedBody } from "@/lib/aiPaused";

// 1アカウントが1日に使える、AI読み取りの回数(スクショ・現物の写真の合計)。
// 月の回数とは別に、暴走を防ぐ安全弁として残す。仮の数字。変更するときはここだけを書き換える。
export const DAILY_AI_READ_LIMIT = 20;

const COLLECTION = "usage_counts_tamari";
// 古い記録はFirestoreのTTL(expireAtフィールド)で消せるよう、期限を入れておく。
const DAILY_RETENTION_DAYS = 7;
const MONTHLY_RETENTION_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;

type Consumed =
  | { refund: () => Promise<void> }
  | { blocked: "daily" | "monthly"; monthlyLimit: number }
  | { blocked: "budget"; used: number; limit: number };

// 設定の記録(config/ai_budget)は、数分ごとに読み直す。読めないときは既定値を使う
// (設定が読めないことで、AI の読み取りを全部止めることはしない)。
const BUDGET_CACHE_MS = 5 * 60 * 1000;
let budgetCache: { value: AiBudget; at: number } | null = null;

async function loadAiBudget(): Promise<AiBudget> {
  const now = Date.now();
  if (budgetCache && now - budgetCache.at < BUDGET_CACHE_MS) return budgetCache.value;
  let value = DEFAULT_AI_BUDGET;
  try {
    const snap = await adminDb.collection(AI_BUDGET_CONFIG_COLLECTION).doc(AI_BUDGET_CONFIG_DOC).get();
    value = snap.exists ? parseAiBudget(snap.data()) : DEFAULT_AI_BUDGET;
  } catch (error) {
    console.warn("ai budget config read error", error);
  }
  budgetCache = { value, at: now };
  return value;
}

// 今日と今月の回数を数え、上限未満なら1つ増やし、その1回分を戻すための関数を返す。
// 日次の上限なら "daily"、月の上限(スイッチがオンのときだけ)なら "monthly" を返し、何も増やさない。
// 確認と加算を1つのトランザクションで行うため、同じ利用者から同時に何度呼ばれても
// 上限を超えない(サーバー側SDKのトランザクションは読んだドキュメントをロックする)。
// Firestoreに問い合わせられない場合は例外を投げる。
async function consumeAiRead(uid: string, feature: AiFeature): Promise<Consumed> {
  const date = jstDateString();
  const month = jstMonthString();
  const ids = { daily: `${uid}_${date}`, monthly: `${uid}_${month}` };
  const monthlyLimit = monthlyAiReadLimit(await getPlan(uid));
  const ref = (id: string) => adminDb.collection(COLLECTION).doc(id);
  const budgetRef = adminDb.collection(AI_BUDGET_COLLECTION).doc(date);
  const points = AI_POINTS[feature];
  const pointLimit = dailyPointLimit(await loadAiBudget());
  let usedPoints = 0;
  const result = await consumeCore(
    (fn) =>
      adminDb.runTransaction((t) =>
        fn({
          async read(id) {
            const snap = await t.get(ref(id));
            const value: unknown = snap.exists ? snap.get("ai_read_count") : 0;
            return typeof value === "number" && Number.isInteger(value) ? value : 0;
          },
          write(id, count) {
            const isDaily = id === ids.daily;
            t.set(
              ref(id),
              {
                uid,
                ...(isDaily ? { date } : { month }),
                ai_read_count: count,
                updated_at: Timestamp.now(),
                expireAt: Timestamp.fromMillis(
                  Date.now() + (isDaily ? DAILY_RETENTION_DAYS : MONTHLY_RETENTION_DAYS) * DAY_MS,
                ),
              },
              { merge: true },
            );
          },
          async readBudget() {
            const snap = await t.get(budgetRef);
            const value: unknown = snap.exists ? snap.get("points") : 0;
            usedPoints = typeof value === "number" && Number.isFinite(value) ? value : 0;
            return usedPoints;
          },
          writeBudget(total) {
            t.set(
              budgetRef,
              {
                date,
                points: total,
                updated_at: Timestamp.now(),
                expireAt: Timestamp.fromMillis(Date.now() + AI_BUDGET_RETENTION_DAYS * DAY_MS),
              },
              { merge: true },
            );
          },
        }),
      ),
    ids,
    { daily: DAILY_AI_READ_LIMIT, monthly: monthlyLimit, enforceMonthly: isPlanEnforced() },
    { points, limit: pointLimit },
  );
  if (result === "budget") return { blocked: "budget", used: usedPoints, limit: pointLimit };
  if (result !== "ok") return { blocked: result, monthlyLimit };
  // AI側のエラーで結果を返せなかった分を戻す。加算したのと同じ日付・月の記録を減らす
  // (途中で日付をまたいでも翌日・翌月分を減らさない)。上限の確認は要らないので
  // トランザクションは使わない。戻す処理自体の失敗は記録だけして、例外は投げない。
  return {
    async refund() {
      try {
        await refundCore(async (id) => {
          await ref(id).update({ ai_read_count: FieldValue.increment(-1), updated_at: Timestamp.now() });
        }, ids);
        // 全員の合計の点数も、この1回分を戻す
        await budgetRef.update({ points: FieldValue.increment(-points), updated_at: Timestamp.now() });
      } catch (error) {
        console.error("usage refund error", error);
      }
    },
  };
}

export const AI_READ_LIMIT_MESSAGE =
  "今日の AI の読み取りは、上限の回数に届きました。明日また使えます。手入力で登録できます。";

type GuardResult =
  | { ok: true; refund: () => Promise<void> }
  | { ok: false; response: NextResponse };

// AIを呼ぶ窓口の入口で使う共通の関所。
// 利用者を確かめ(できなければ401)、回数を1つ使う(上限なら429、数えられなければ503)。
// Firestoreに問い合わせられない場合も、上限を確かめられないままAIを呼ぶことはしない。
// feature は、全員の合計の1日の点数で、1回を何点と数えるか(lib/aiBudget.ts の AI_POINTS)。
// 全員の合計の上限に届いたときは、AI の利用額の上限と同じ「休んでいます」の文を 503 で返し、
// ログに [AI_DAILY_BUDGET] を出し(どの窓口かを route で書く)、ホームの運営者あての窓口で運営者に知らせる(依頼253。lib/operatorNotify.ts)。
export async function guardAiRead(
  authorization: string | null,
  feature: AiFeature,
  route: string,
): Promise<GuardResult> {
  const uid = await verifyBearerIdToken(authorization);
  if (!uid) {
    return {
      ok: false,
      response: NextResponse.json({ error: "ログインを確認できませんでした" }, { status: 401 }),
    };
  }
  let consumed: Consumed;
  try {
    consumed = await consumeAiRead(uid, feature);
  } catch (error) {
    console.error("usage count error", error);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "ただいま読み取りを受け付けられません。時間をおいてもう一度お試しください。" },
        { status: 503 },
      ),
    };
  }
  if ("blocked" in consumed) {
    if (consumed.blocked === "budget") {
      console.error(aiBudgetLog(route, consumed.used, consumed.limit));
      await notifyOperator("ai-daily-limit");
      return { ok: false, response: NextResponse.json(aiPausedBody(), { status: 503 }) };
    }
    if (consumed.blocked === "monthly") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: monthlyLimitMessage(consumed.monthlyLimit), code: "monthly_limit", limit: consumed.monthlyLimit },
          { status: 429 },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: AI_READ_LIMIT_MESSAGE, code: "daily_limit", limit: DAILY_AI_READ_LIMIT },
        { status: 429 },
      ),
    };
  }
  return { ok: true, refund: consumed.refund };
}
