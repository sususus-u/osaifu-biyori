// 項目を新しく作る保存の前の、件数の上限の確認。純粋な関数。
// 上限の数は planLimits.ts の PLAN_LIMITS だけに書く。強制のスイッチがオフのときは、常に許可する。
import { PLAN_LIMITS, type Plan } from "./planLimits.ts";

const PLAN_LABEL: Record<Plan, string> = { free: "無料", paid1: "有料1", paid2: "有料2" };

export function recordLimitMessage(plan: Plan): string {
  const p = PLAN_LIMITS[plan] ? plan : "free";
  return `${PLAN_LABEL[p]}プランの上限(${PLAN_LIMITS[p].maxRecords}件)に達しました。不要な項目を削除するか、プランの変更をご検討ください。`;
}

export type RecordLimitResult = { ok: true } | { ok: false; limit: number; message: string };

// current: 今の件数(countRecords)。adding: 今回の保存で増える件数(足す・編集・残高の更新は0)
export function checkRecordLimit(o: { current: number; adding: number; plan: Plan; enforced: boolean }): RecordLimitResult {
  if (!o.enforced || o.adding <= 0) return { ok: true };
  const p = PLAN_LIMITS[o.plan] ? o.plan : "free";
  const limit = PLAN_LIMITS[p].maxRecords;
  if (o.current + o.adding <= limit) return { ok: true };
  return { ok: false, limit, message: recordLimitMessage(p) };
}

// 上限で止めたことを、保存の流れ(saveStamps)から画面へ伝える
export class RecordLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordLimitError";
  }
}
