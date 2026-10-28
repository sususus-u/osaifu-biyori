// プランごとの上限を、このファイルだけに書く(他の場所に数字を直書きしない)。
// 暫定の数字で、将来変更する可能性がある。変えるときはここだけを書き換える。

import { AI_PLAN_LIMIT_MESSAGES, AI_READ_LIMITS, type Plan } from "./plan-resolve.ts";

export type { Plan };

// AI の読み取りの月の回数は、3つのサービスの合計で、ハブの正本(plan-resolve.ts の AI_READ_LIMITS)に1か所で書く(依頼293)。
export const PLAN_LIMITS: Record<Plan, { maxRecords: number; monthlyAiReads: number }> = {
  free: { maxRecords: 30, monthlyAiReads: AI_READ_LIMITS.free.monthly },
  paid1: { maxRecords: 100, monthlyAiReads: AI_READ_LIMITS.paid1.monthly },
  paid2: { maxRecords: 500, monthlyAiReads: AI_READ_LIMITS.paid2.monthly },
};

// グループ数の上限(無料のみ。暫定)。
export const FREE_MAX_GROUPS = 3;

// プランは、プランの記録(subscriptions/{uid})を、その人のログインで読んで決める(段階3の5番目、依頼287)。
// 読む部品は lib/plan-resolve.ts(ハブの正本の写し)の readPlanWithIdToken。つなぐ所は lib/usageLimit.ts。
// 上限の強制(ENFORCE_PLAN_LIMITS)がオフの間は、記録を読まずに "free"。読めないときも、決まりどおり。

export function monthlyAiReadLimit(plan: Plan): number {
  return (PLAN_LIMITS[plan] ?? PLAN_LIMITS.free).monthlyAiReads;
}

// 月の回数で止めるかどうか。環境変数 ENFORCE_PLAN_LIMITS が "true" のときだけ止める(未設定は止めない)。
export function isPlanEnforced(env: string | undefined = process.env.ENFORCE_PLAN_LIMITS): boolean {
  return env === "true";
}

// 月の回数に届いたときの文(ハブの BRAND.md 3章。依頼293で、言葉の決まりの文にそろえた。回数は文に入れない)
export function monthlyLimitMessage(): string {
  return AI_PLAN_LIMIT_MESSAGES.monthly;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 日本時間の日付(YYYY-MM-DD)。深夜0時で切り替わる。
export function jstDateString(now = Date.now()): string {
  return new Date(now + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// 日本時間の年月(YYYY-MM)。毎月1日の0時で切り替わる。
export function jstMonthString(now = Date.now()): string {
  return jstDateString(now).slice(0, 7);
}
