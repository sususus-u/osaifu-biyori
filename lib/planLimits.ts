// プランごとの上限。数は、ホームの「プランごとにできることの表」(lib/plan-resolve.ts の PLAN_FEATURES。
// ハブの正本の写し。依頼374)から読む。このアプリに数を直書きしない。変えるときは、ハブの正本を直して写す。

import { AI_PLAN_LIMIT_MESSAGES, PLAN_FEATURES, type Plan } from "./plan-resolve.ts";

export type { Plan };

// 件数(3つのサービスの合計。上限の確かめはホームの /api/records/check)と、AI の読み取りの月の回数(3つのサービスの合計)。
// 前の件数 30・100・500 は、表の 80・300・1,000 にそろえた(依頼374。このアプリの中では、件数で止める所はない)。
export const PLAN_LIMITS: Record<Plan, { maxRecords: number; monthlyAiReads: number }> = {
  free: { maxRecords: PLAN_FEATURES.free.records, monthlyAiReads: PLAN_FEATURES.free.aiMonthly },
  paid1: { maxRecords: PLAN_FEATURES.paid1.records, monthlyAiReads: PLAN_FEATURES.paid1.aiMonthly },
  paid2: { maxRecords: PLAN_FEATURES.paid2.records, monthlyAiReads: PLAN_FEATURES.paid2.aiMonthly },
};

// グループの数の上限(FREE_MAX_GROUPS = 3)は、なくした(依頼374)。グループは並べ方の札なので、入れ物の数には数えない
// (ハブの BRAND.md 18章「入れ物と共有の共通の決まり」。どこからも使っていなかった)。

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
