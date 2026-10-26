// AI読み取りの回数の確認と戻しの中身(Firestoreに依存しない部分。単体テストできるよう分けてある)。
// 日次(暴走を防ぐ安全弁)と月次を、同じトランザクションの中で数える。
// 全員の合計の1日の点数(依頼218)も、渡されたときは、同じトランザクションの中で数える。

export interface UsageTx {
  read(id: string): Promise<number>;
  write(id: string, count: number): void;
  // 全員の合計の、その日の点数(budget を渡したときだけ使う)
  readBudget?(): Promise<number>;
  writeBudget?(points: number): void;
}

export type ConsumeResult = "ok" | "daily" | "monthly" | "budget";

export async function consumeCore(
  run: <T>(fn: (tx: UsageTx) => Promise<T>) => Promise<T>,
  ids: { daily: string; monthly: string },
  limits: { daily: number; monthly: number; enforceMonthly: boolean },
  budget?: { points: number; limit: number },
): Promise<ConsumeResult> {
  return run(async (tx) => {
    const daily = await tx.read(ids.daily);
    const monthly = await tx.read(ids.monthly);
    const used = budget && tx.readBudget ? await tx.readBudget() : 0;
    if (daily >= limits.daily) return "daily";
    // スイッチがオフのときは、月の回数は数えるだけで止めない。
    if (limits.enforceMonthly && monthly >= limits.monthly) return "monthly";
    // 全員の合計: この1回を足すと、その日の上限を超えるなら止める(1人ごとの回数は増やさない)。
    if (budget && used + budget.points > budget.limit) return "budget";
    tx.write(ids.daily, daily + 1);
    tx.write(ids.monthly, monthly + 1);
    if (budget && tx.writeBudget) tx.writeBudget(used + budget.points);
    return "ok";
  });
}

// 日次と月次の両方を1回分戻す。
export async function refundCore(
  decrement: (id: string) => Promise<void>,
  ids: { daily: string; monthly: string },
): Promise<void> {
  await decrement(ids.daily);
  await decrement(ids.monthly);
}
