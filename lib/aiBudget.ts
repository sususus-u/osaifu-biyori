// 全員の合計の、AI の1日の上限(依頼218、ハブの点検の M8)。Firestore に依存しない部分。
// 点数で数える(1点 = 0.001ドル)。機能ごとに、1回の点数を、多めの費用の見積もりから決める(依頼217)。
// 1日の上限の点数 = 月の上限(ドル) × 1日の割合 × サービスの割合 × 1,000。
// 値は、設定の記録 config/ai_budget(サーバーだけが読む)にあればそれを使い、なければ下の既定値を使う。
// 月の上限を変えるときは、設定の記録の monthly_limit_usd の1か所を直せば、3つのサービスとも合う。

export type BudgetService = "tabe" | "mamori" | "osaifu";

export const AI_BUDGET_SERVICE: BudgetService = "osaifu";
export const AI_BUDGET_CONFIG_COLLECTION = "config";
export const AI_BUDGET_CONFIG_DOC = "ai_budget";

// 日ごとの点数の合計の記録: usage_global_tamari/{日本時間の日付} = { date, points, updated_at, expireAt }
// (内部の名前は、usage_counts_tamari にそろえる)
export const AI_BUDGET_COLLECTION = "usage_global_tamari";
export const AI_BUDGET_RETENTION_DAYS = 3;

export interface AiBudget {
  monthlyLimitUsd: number;
  dailyRatio: number;
  shares: Record<BudgetService, number>;
}

export const DEFAULT_AI_BUDGET: AiBudget = {
  monthlyLimitUsd: 30,
  dailyRatio: 0.1,
  shares: { tabe: 0.4, mamori: 0.2, osaifu: 0.4 },
};

// 1回の点数(1点 = 0.001ドル)。スクショは Haiku で最大 約0.008ドル、
// 現物は Sonnet で、呼び直しを含めて最大 約0.04ドル(依頼217の見積もり)。
export const AI_POINTS = {
  scanAccount: 8,
  scanPhysical: 40,
} as const;

export type AiFeature = keyof typeof AI_POINTS;

const POINTS_PER_USD = 1000;

function pick(value: unknown, fallback: number, ok: (n: number) => boolean): number {
  return typeof value === "number" && Number.isFinite(value) && ok(value) ? value : fallback;
}

// 設定の記録の中身を読む。項目がない・型が違う・範囲の外のときは、その項目だけ既定値を使う。
// 項目: monthly_limit_usd(数値、0より大きい)、daily_ratio(数値、0より大きく1以下)、
//       share_tabe・share_mamori・share_osaifu(数値、0以上1以下)
export function parseAiBudget(data: unknown): AiBudget {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const share = (key: BudgetService) =>
    pick(d[`share_${key}`], DEFAULT_AI_BUDGET.shares[key], (n) => n >= 0 && n <= 1);
  return {
    monthlyLimitUsd: pick(d.monthly_limit_usd, DEFAULT_AI_BUDGET.monthlyLimitUsd, (n) => n > 0 && n <= 100000),
    dailyRatio: pick(d.daily_ratio, DEFAULT_AI_BUDGET.dailyRatio, (n) => n > 0 && n <= 1),
    shares: { tabe: share("tabe"), mamori: share("mamori"), osaifu: share("osaifu") },
  };
}

export function dailyPointLimit(budget: AiBudget, service: BudgetService = AI_BUDGET_SERVICE): number {
  const raw = budget.monthlyLimitUsd * budget.dailyRatio * budget.shares[service] * POINTS_PER_USD;
  // 0.1 などの小数の誤差で、1点少なくならないようにしてから切り捨てる
  return Math.floor(Math.round(raw * 1e6) / 1e6);
}

// 1日の上限に届いたときのログの印(AI の利用額の上限の [AI_PAUSED] とは別)。
export const AI_BUDGET_LOG_MARK = "[AI_DAILY_BUDGET]";

export function aiBudgetLog(route: string, used: number, limit: number): string {
  return `${AI_BUDGET_LOG_MARK} osaifu-biyori ${route}: 全員の合計の1日の上限に届いています(${used}/${limit}点)`;
}
