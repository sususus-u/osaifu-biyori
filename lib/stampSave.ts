// 切手の保存の流れ。Firestore の呼び出しは引数(deps)で受けるので、テストでは本物を使わない。
// 1) 名前ごとにクエリで候補を集め、足す先の ID を決める
// 2) トランザクション内で、その ID を読み直して条件を確かめ直し、全行を足す・作る(全部成功か、全部失敗)
import {
  planStampSave,
  type ExistingItem,
  type SaveRow,
  type StampPlanItem,
} from "./stampMerge.ts";

export interface StampTx {
  // 読み直す。なくなっていれば null
  get(id: string): Promise<ExistingItem | null>;
  addTo(id: string, newCount: number, newBalance: number): void;
  create(item: { name: string; faceValue: number; count: number; amount: number }): void;
}

export interface StampSaveDeps {
  // 名前が完全に同じ項目(本人のもの)を探す
  findByName(name: string): Promise<ExistingItem[]>;
  // fn が失敗(例外)したら何も書かない。競合したときは fn を呼び直してよい
  runTransaction<T>(fn: (tx: StampTx) => Promise<T>): Promise<T>;
}

export async function saveStamps(deps: StampSaveDeps, rows: SaveRow[]): Promise<StampPlanItem[]> {
  const names = [...new Set(rows.map((r) => r.name))];
  const candidates = (await Promise.all(names.map((n) => deps.findByName(n)))).flat();
  const targetIds = planStampSave(candidates, rows).flatMap((p) => (p.kind === "add" ? [p.id] : []));

  return deps.runTransaction(async (tx) => {
    // トランザクションでは、読み取りを全部終えてから書く
    const fresh: ExistingItem[] = [];
    for (const id of targetIds) {
      const item = await tx.get(id);
      if (item) fresh.push(item);
    }
    const plan = planStampSave(fresh, rows);
    for (const p of plan) {
      if (p.kind === "add") tx.addTo(p.id, p.newCount, p.newBalance);
      else tx.create(p);
    }
    return plan;
  });
}
