// 画面側の、保存前の上限の確認(ブラウザで動く。テストでは動かさない。判定は recordLimit.ts / recordCount.ts)。
// 1) /api/plan-limits で、プランと強制のスイッチを聞く(Firestore は読まない)。スイッチがオフなら、ここで許可して終わり。
// 2) オンのときだけ、本人の項目を ownerId で1回読み、件数を数える(読み取り=項目の数だけ)。
// 取得に失敗したときは、利用者を止めない(許可)。ログには種類だけ出す。
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { authFetch } from "./authFetch";
import { PLAN_LIMITS, type Plan } from "./planLimits.ts";
import { checkRecordLimit } from "./recordLimit.ts";
import { countRecords, newRecordCount, toCountItem, type CountItem } from "./recordCount.ts";

// 止めるときは案内の文を返す。許可のときは null
export async function guardNewRecords(uid: string, planned: CountItem[]): Promise<string | null> {
  if (planned.length === 0) return null;
  try {
    const res = await authFetch("/api/plan-limits");
    if (!res.ok) {
      console.error("plan-limits: http", res.status);
      return null;
    }
    const body = (await res.json()) as { plan?: string; enforced?: boolean };
    if (body.enforced !== true) return null;
    const plan: Plan = body.plan && body.plan in PLAN_LIMITS ? (body.plan as Plan) : "free";
    const snap = await getDocs(query(collection(db, "accounts"), where("ownerId", "==", uid)));
    const existing = snap.docs.map((d) => toCountItem(d.data()));
    const r = checkRecordLimit({
      current: countRecords(existing),
      adding: newRecordCount(existing, planned),
      plan,
      enforced: true,
    });
    return r.ok ? null : r.message;
  } catch {
    console.error("plan-limits: check-failed");
    return null;
  }
}
