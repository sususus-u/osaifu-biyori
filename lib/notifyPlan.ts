// 毎朝のお知らせ(app/api/send-notifications)で、持ち主ごとのプランを決める(依頼317 仕事1)。
// 毎朝の処理には、その人のログイン(IDトークン)がないので、画面の窓口(GET /api/plan)と同じ読み方はできない。
// - 上限の強制(ENFORCE_PLAN_LIMITS)がオフの間は、読まずに "free"(みな、いちばん早い日だけ)。
// - オンのときは、サーバーの権限(Admin SDK)で subscriptions/{uid} を読み、plan-resolve.ts の決まり(planFromRecord)で決める。
//   読めないときは、控え(plan_last_known/{uid} の tamari の欄。画面の窓口が読めたときに書く)を48時間使う。それもなければ "free"。
// 決まりの部品は、ハブの正本の写し(lib/plan-resolve.ts)をそのまま使い、ここでは中身の読み替えだけをする。

import {
  isPlan,
  isSubscriptionStatus,
  resolvePlan,
  type LastKnownStore,
  type Plan,
  type PlanRead,
  type SubscriptionRecord,
} from "./plan-resolve.ts";

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const t = v as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === "function") {
    const d = t.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

// Admin SDK で読んだ記録の中身を、plan-resolve.ts の形にする。おかしい値は、解約済み(無料)として読む
// (plan-resolve.ts の decodeSubscription と同じ決まり)。
export function subscriptionFromAdminData(data: Record<string, unknown> | undefined): SubscriptionRecord {
  const d = data ?? {};
  const valid = isPlan(d.plan) && isSubscriptionStatus(d.status);
  return {
    plan: valid ? (d.plan as Plan) : "free",
    status: valid ? (d.status as SubscriptionRecord["status"]) : "canceled",
    paidThrough: toDate(d.paidThrough),
    checkedAt: toDate(d.checkedAt),
    updatedAt: toDate(d.updatedAt),
    squareCustomerId: str(d.squareCustomerId),
    squareSubscriptionId: str(d.squareSubscriptionId),
  };
}

type SnapLike = { exists: boolean; data(): Record<string, unknown> | undefined };
export type SubscriptionReader = (uid: string) => Promise<SnapLike>;

// 持ち主1人のプラン。どの失敗も例外にしない
export async function planForNotify(input: {
  uid: string;
  enforced: boolean;
  read: SubscriptionReader;
  store: LastKnownStore | null;
  now: Date;
}): Promise<Plan> {
  if (!input.enforced) return "free";
  let read: PlanRead;
  try {
    const snap = await input.read(input.uid);
    read = { ok: true, record: snap.exists ? subscriptionFromAdminData(snap.data()) : null };
  } catch {
    read = { ok: false };
  }
  const lastKnown = !read.ok && input.store ? await input.store.load(input.uid).catch(() => null) : null;
  return resolvePlan({ read, lastKnown, now: input.now }).plan;
}
