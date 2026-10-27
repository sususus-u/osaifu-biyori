// プランごとの上限を、このファイルだけに書く(他の場所に数字を直書きしない)。
// 暫定の数字で、将来変更する可能性がある。変えるときはここだけを書き換える。

export type Plan = "free" | "paid1" | "paid2";

export const PLAN_LIMITS: Record<Plan, { maxRecords: number; monthlyAiReads: number }> = {
  free: { maxRecords: 30, monthlyAiReads: 10 },
  paid1: { maxRecords: 100, monthlyAiReads: 50 },
  paid2: { maxRecords: 500, monthlyAiReads: 150 },
};

// グループ数の上限(無料のみ。暫定)。
export const FREE_MAX_GROUPS = 3;

// プランを返す。段階3で、ハブから取得する形に差し替える。
// 取得に失敗したときや、分からないときは、安全側として "free" にする。
export async function getPlan(uid: string): Promise<Plan> {
  void uid;
  try {
    return "free";
  } catch {
    return "free";
  }
}

export function monthlyAiReadLimit(plan: Plan): number {
  return (PLAN_LIMITS[plan] ?? PLAN_LIMITS.free).monthlyAiReads;
}

// 月の回数で止めるかどうか。環境変数 ENFORCE_PLAN_LIMITS が "true" のときだけ止める(未設定は止めない)。
export function isPlanEnforced(env: string | undefined = process.env.ENFORCE_PLAN_LIMITS): boolean {
  return env === "true";
}

export function monthlyLimitMessage(limit: number): string {
  return `今月のAI読み取りの回数（${limit}回）に達しました。毎月1日にリセットされます`;
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
