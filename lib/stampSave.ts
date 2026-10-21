// 切手の保存の流れ。Firestore の呼び出しは引数(deps)で受けるので、テストでは本物を使わない。
// 1) 本人の項目を取得し、種類・正規化した名前・額面で絞って、足す先の ID を決める
// 2) トランザクション内で、その ID を読み直して条件を確かめ直し、全行を足す・作る(全部成功か、全部失敗)
import {
  planStampSave,
  type ExistingItem,
  type SaveRow,
  type StampPlanItem,
  stampItemText,
  stampSaveMessage,
} from "./stampMerge.ts";

// 保存した項目の ID と案内(一覧で、該当の行の下に案内を出すために使う)
export interface StampSaveResult {
  plan: StampPlanItem[];
  items: { id: string; kind: "add" | "create"; text: string }[];
  message: string;
}

export interface StampTx {
  // 読み直す。なくなっていれば null
  get(id: string): Promise<ExistingItem | null>;
  addTo(id: string, newCount: number, newBalance: number): void;
  // 作った項目の新しい ID を返す
  create(item: { name: string; faceValue: number; count: number; amount: number }): string;
}

export interface StampSaveDeps {
  // 本人の項目を取る(名前のゆれはクエリで吸収できないため、絞り込みは planStampSave で行う)
  listMine(): Promise<ExistingItem[]>;
  // fn が失敗(例外)したら何も書かない。競合したときは fn を呼び直してよい
  runTransaction<T>(fn: (tx: StampTx) => Promise<T>): Promise<T>;
}

export async function saveStamps(deps: StampSaveDeps, rows: SaveRow[]): Promise<StampSaveResult> {
  const candidates = await deps.listMine();
  const plan0 = planStampSave(candidates, rows);
  const targetIds = plan0.flatMap((p) => (p.kind === "add" ? [p.id] : []));
  // 足す対象の候補が2件以上あったか(トランザクションの中では、足す先の1件しか読まないので、ここで控える)
  const multipleIds = new Set(plan0.flatMap((p) => (p.kind === "add" && p.multiple ? [p.id] : [])));

  return deps.runTransaction(async (tx) => {
    // トランザクションでは、読み取りを全部終えてから書く
    const fresh: ExistingItem[] = [];
    for (const id of targetIds) {
      const item = await tx.get(id);
      if (item) fresh.push(item);
    }
    const plan = planStampSave(fresh, rows).map((p) =>
      p.kind === "add" && multipleIds.has(p.id) ? { ...p, multiple: true as const } : p
    );
    const items: StampSaveResult["items"] = [];
    for (const p of plan) {
      if (p.kind === "add") {
        tx.addTo(p.id, p.newCount, p.newBalance);
        items.push({ id: p.id, kind: "add", text: stampItemText(p) });
      } else {
        items.push({ id: tx.create(p), kind: "create", text: stampItemText(p) });
      }
    }
    return { plan, items, message: stampSaveMessage(plan) };
  });
}
