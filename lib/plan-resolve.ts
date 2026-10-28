// 写し(手で書き換えない)。正本: ハブ(okizukibiyori-hub)の src/lib/plan-resolve.ts
// 正本の版: 44d49d21d370d167 / 写しの中身の版: 44d49d21d370d167
// 正本を直したら、ハブで node scripts/plan-resolve-copy.mjs を実行して写し直す(BRAND.md 17章)。
// プランを決める部品(BRAND.md 17章「段階3」、依頼280)。ハブが正本。
// 3つのサービスへ写す(段階3の5番目、依頼287。写しの頭に、正本の版を書く。BRAND.md 17章)。
// そのため、この中では、ほかのファイルを import しない(型の Plan も、ここで持つ)。
// 通信も時刻の取得もせず、受け取った値だけで決める(記録を読む通信は、読む側がする)。
//
// 決まり(2026-10-25 の決定、依頼196):
// - プランの記録(subscriptions/{uid})を読めたら、その中身で決める。解約済みと読めたら、すぐ無料。
// - 読めなかったら、最後に有効だったプラン(読む側が、読めたときに控えておく)を48時間保つ。
//   48時間を過ぎたとき、一度も確かめたことがないときは、無料。
// - 支払いの失敗は、7日の猶予のあと無料(17章)。Webhook が記録を直すが、遅れても、ここで止まる。

export type Plan = "free" | "paid1" | "paid2";

// 契約中・解約予定・支払いの失敗・解約済み
export type SubscriptionStatus = "active" | "canceling" | "past_due" | "canceled";

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "active",
  "canceling",
  "past_due",
  "canceled",
];

export type SubscriptionRecord = {
  plan: Plan;
  status: SubscriptionStatus;
  // 払い済みの期間の終わり
  paidThrough: Date | null;
  // 最後に Square で確かめた時刻
  checkedAt: Date | null;
  updatedAt: Date | null;
  // サーバーだけが使う(画面には出さない)
  squareCustomerId: string | null;
  squareSubscriptionId: string | null;
};

// 読む側が、読めたときに控えておく値
export type LastKnownPlan = { plan: Plan; confirmedAt: Date };

// 記録を読んだ結果。ok: true で record: null は「記録がない」(契約したことがない)。
export type PlanRead = { ok: true; record: SubscriptionRecord | null } | { ok: false };

export const PLAN_READ_GRACE_MS = 48 * 60 * 60 * 1000;
export const PAYMENT_FAILURE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function isPlan(value: unknown): value is Plan {
  return value === "free" || value === "paid1" || value === "paid2";
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

// 記録の中身から、今のプランを決める。
// 払い済みの期間の終わりを過ぎても、Square の更新の知らせが遅れることがあるので、48時間は保つ
// (支払いの失敗のときは、7日)。
export function planFromRecord(record: SubscriptionRecord | null, now: Date): Plan {
  if (!record) return "free";
  if (record.status === "canceled" || record.plan === "free") return "free";
  if (!record.paidThrough) return "free";
  const grace = record.status === "past_due" ? PAYMENT_FAILURE_GRACE_MS : PLAN_READ_GRACE_MS;
  return now.getTime() <= record.paidThrough.getTime() + grace ? record.plan : "free";
}

// 今のプランと、次に控えておく値を返す。
export function resolvePlan(input: {
  read: PlanRead;
  lastKnown: LastKnownPlan | null;
  now: Date;
}): { plan: Plan; lastKnown: LastKnownPlan | null } {
  const { read, lastKnown, now } = input;
  if (read.ok) {
    const plan = planFromRecord(read.record, now);
    return { plan, lastKnown: { plan, confirmedAt: now } };
  }
  if (lastKnown && isPlan(lastKnown.plan)) {
    const age = now.getTime() - lastKnown.confirmedAt.getTime();
    // 時計が戻っていて「未来に確かめた」ことになっているときも、信じない
    if (age >= 0 && age <= PLAN_READ_GRACE_MS) {
      return { plan: lastKnown.plan, lastKnown };
    }
  }
  return { plan: "free", lastKnown };
}

// --- 記録を、その人のログインで読む(段階3の5番目、依頼287) ---
// 3つのサービスは、サーバーから、その人の IDトークンで Firestore の REST API を呼ぶ(ルールが効く)。
// ルールの公開の前は、断られる(403)ので、読めない(ok: false)として扱う。エラーにはしない。

// ハブと3つのサービスが共用している Firebase プロジェクト
export const PLAN_FIREBASE_PROJECT_ID = "okizukibiyori";
export const SUBSCRIPTIONS_COLLECTION = "subscriptions";

export type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  timestampValue?: string;
  nullValue?: null;
};
export type FirestoreFields = Record<string, FirestoreValue | undefined>;

function fieldString(v: FirestoreValue | undefined): string | null {
  return typeof v?.stringValue === "string" && v.stringValue ? v.stringValue : null;
}

function fieldTime(v: FirestoreValue | undefined): Date | null {
  if (typeof v?.timestampValue !== "string") return null;
  const d = new Date(v.timestampValue);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 記録1つの URL(REST API)
export function subscriptionDocUrl(uid: string, projectId: string = PLAN_FIREBASE_PROJECT_ID): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${SUBSCRIPTIONS_COLLECTION}/${encodeURIComponent(uid)}`;
}

// 読めた記録の中身が、おかしいとき(プランや状態の値が知らないもの)は、解約済みとして読む(無料)。
export function decodeSubscription(fields: FirestoreFields | undefined): SubscriptionRecord {
  const f = fields ?? {};
  const plan = fieldString(f.plan);
  const status = fieldString(f.status);
  const valid = isPlan(plan) && isSubscriptionStatus(status);
  return {
    plan: valid ? plan : "free",
    status: valid ? status : "canceled",
    paidThrough: fieldTime(f.paidThrough),
    checkedAt: fieldTime(f.checkedAt),
    updatedAt: fieldTime(f.updatedAt),
    squareCustomerId: fieldString(f.squareCustomerId),
    squareSubscriptionId: fieldString(f.squareSubscriptionId),
  };
}

// REST API の答え(状態の番号と、中身)から、読んだ結果を作る。
// 200 は読めた。404 は記録がない(契約したことがない。読めた扱い)。それ以外(403 など)は読めない。
export function planReadFromResponse(status: number, body: unknown): PlanRead {
  if (status === 404) return { ok: true, record: null };
  if (status !== 200 || !body || typeof body !== "object") return { ok: false };
  return { ok: true, record: decodeSubscription((body as { fields?: FirestoreFields }).fields) };
}

// --- 読めたときの控え(読む側が持つ。JSON の文字列にする) ---

export function encodeLastKnown(value: LastKnownPlan): string {
  return JSON.stringify({ plan: value.plan, confirmedAt: value.confirmedAt.toISOString() });
}

export function decodeLastKnown(raw: unknown): LastKnownPlan | null {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const { plan, confirmedAt } = obj as { plan?: unknown; confirmedAt?: unknown };
  if (!isPlan(plan) || typeof confirmedAt !== "string") return null;
  const d = new Date(confirmedAt);
  return Number.isNaN(d.getTime()) ? null : { plan, confirmedAt: d };
}

// --- 読む側の流れ(3つのサービスのサーバーが使う。依頼287) ---
// 通信は、渡された fetch でする(テストのため)。控えは、渡された入れ物に置く。

// 3つのサービスの中の名前(控えの欄の名前。旧名のまま)
export type PlanService = "mamori" | "tamari" | "tabe";

export type LastKnownStore = {
  load(uid: string): Promise<LastKnownPlan | null>;
  save(uid: string, value: LastKnownPlan): Promise<void>;
};

// 控えの置き場所: plan_last_known/{uid}(1人に1つ。サービスごとの欄に、JSON の文字列)。
// 書くのは各サービスのサーバー(管理者の権限)だけ。ルールには match を置かない(画面からは読めない・書けない)。
export const LAST_KNOWN_COLLECTION = "plan_last_known";

type LastKnownDocLike = {
  get(): Promise<{ exists: boolean; get(field: string): unknown }>;
  set(data: Record<string, unknown>, options: { merge: true }): Promise<unknown>;
};
type LastKnownDbLike = { collection(name: string): { doc(id: string): LastKnownDocLike } };

export function firestoreLastKnownStore(db: LastKnownDbLike, service: PlanService): LastKnownStore {
  const ref = (uid: string) => db.collection(LAST_KNOWN_COLLECTION).doc(uid);
  return {
    async load(uid) {
      const snap = await ref(uid).get();
      return snap.exists ? decodeLastKnown(snap.get(service)) : null;
    },
    async save(uid, value) {
      await ref(uid).set({ [service]: encodeLastKnown(value) }, { merge: true });
    },
  };
}

// その人のプランを返す。上限の強制がオフ(enforced: false)のときは、記録を読まずに無料。
// 読めないとき(ルールの公開の前の 403、通信の失敗など)は、控えを48時間使う。どの失敗も、例外にしない。
export async function readPlanWithIdToken(input: {
  uid: string;
  idToken: string;
  enforced: boolean;
  fetchImpl: typeof fetch;
  store: LastKnownStore | null;
  now: Date;
  timeoutMs?: number;
}): Promise<Plan> {
  const { uid, idToken, enforced, fetchImpl, store, now } = input;
  if (!enforced) return "free";
  let read: PlanRead;
  try {
    const res = await fetchImpl(subscriptionDocUrl(uid), {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ?? 3000),
    });
    const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
    read = planReadFromResponse(res.status, body);
  } catch {
    read = { ok: false };
  }
  let lastKnown: LastKnownPlan | null = null;
  if (!read.ok && store) lastKnown = await store.load(uid).catch(() => null);
  const result = resolvePlan({ read, lastKnown, now });
  if (read.ok && result.lastKnown && store) {
    await store.save(uid, result.lastKnown).catch(() => undefined);
  }
  return result.plan;
}

// --- AI の読み取りの回数(3つのサービスの合計。段階3の6番目、依頼293。BRAND.md 17章) ---
// 回数は、ここだけに書く(仮の数。無料の月20回だけ決定)。回数を見せる所(ホームのアカウントの画面など)も、ここから出す。
// 3つのサービスのサーバーが、今の回数の数え(サービスごと・機能ごとの1日の上限と、全員の合計の1日の点数)が
// 通ったあとに、この合計の記録を足す(ホームを通さない)。
// - 上限の強制(enforced)がオフの間は、数えるだけで、断らない。オンのときだけ、プランの回数に届いたら断る。
// - 数えの記録が書けなかったときは、読み取りそのものは止めない(not_counted を返す)。
export const AI_READ_LIMITS: Record<Plan, { monthly: number; daily: number }> = {
  free: { monthly: 20, daily: 5 },
  paid1: { monthly: 100, daily: 15 },
  paid2: { monthly: 300, daily: 30 },
};

// 上限に届いたときの文(BRAND.md 3章「言葉の決まり」)
export const AI_PLAN_LIMIT_MESSAGES = {
  monthly: "今月の AI の読み取りは、上限の回数に届きました。来月1日からまた使えます。手入力で登録できます。",
  daily: "今日の AI の読み取りは、上限の回数に届きました。明日また使えます。手入力で登録できます。",
} as const;

// 合計の記録: ai_usage_monthly/{uid}_{日本時間の年月}
// 欄: uid、month、total(今月の合計)、mamori・tamari・tabe(サービスごとの今月の数)、day(日本時間の日付)、
// dayTotal(その日の合計)、updatedAt、expireAt(62日後。TTL を付ければ古い記録が消える)。
export const AI_USAGE_COLLECTION = "ai_usage_monthly";
const AI_USAGE_RETENTION_MS = 62 * 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstDayKey(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function jstMonthKey(now: Date): string {
  return jstDayKey(now).slice(0, 7);
}

export function aiUsageDocId(uid: string, now: Date): string {
  return `${uid}_${jstMonthKey(now)}`;
}

const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);

// 記録の中身から、今月の合計と今日の合計を読む(日付が変わっていれば、今日は0)
export function readAiUsage(data: Record<string, unknown> | undefined, now: Date): { total: number; dayTotal: number } {
  if (!data) return { total: 0, dayTotal: 0 };
  return { total: count(data.total), dayTotal: data.day === jstDayKey(now) ? count(data.dayTotal) : 0 };
}

export type AiUsageBlock = "monthly" | "daily";

// この1回を足すと、プランの回数を超えるか
export function aiUsageBlock(usage: { total: number; dayTotal: number }, plan: Plan): AiUsageBlock | null {
  const limits = AI_READ_LIMITS[plan] ?? AI_READ_LIMITS.free;
  if (usage.total >= limits.monthly) return "monthly";
  if (usage.dayTotal >= limits.daily) return "daily";
  return null;
}

type UsageSnapLike = { exists: boolean; data(): Record<string, unknown> | undefined };
type UsageTxLike<R> = {
  get(ref: R): Promise<UsageSnapLike>;
  set(ref: R, data: Record<string, unknown>, options: { merge: true }): unknown;
};
type UsageDbLike<R> = {
  collection(name: string): { doc(id: string): R };
  runTransaction<T>(fn: (tx: UsageTxLike<R>) => Promise<T>): Promise<T>;
};

export type AiUsageCount =
  | { status: "counted"; refund: () => Promise<void> }
  | { status: "blocked"; reason: AiUsageBlock; message: string }
  | { status: "not_counted" };

// 合計の記録に1回足す。強制がオンでプランの回数に届いていれば、足さずに blocked。
// 失敗(書けない・読めない)は not_counted(呼ぶ側は、読み取りを止めない)。例外は投げない。
export async function countAiUsage<R>(
  db: UsageDbLike<R>,
  input: { uid: string; service: PlanService; plan: Plan; enforced: boolean; now: Date },
): Promise<AiUsageCount> {
  const { uid, service, plan, enforced, now } = input;
  const day = jstDayKey(now);
  let ref: R;
  try {
    ref = db.collection(AI_USAGE_COLLECTION).doc(aiUsageDocId(uid, now));
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : undefined;
      const usage = readAiUsage(data, now);
      const block = enforced ? aiUsageBlock(usage, plan) : null;
      if (block) return block;
      tx.set(
        ref,
        {
          uid,
          month: jstMonthKey(now),
          total: usage.total + 1,
          [service]: count(data?.[service]) + 1,
          day,
          dayTotal: usage.dayTotal + 1,
          updatedAt: now,
          expireAt: new Date(now.getTime() + AI_USAGE_RETENTION_MS),
        },
        { merge: true },
      );
      return null;
    });
    if (outcome) return { status: "blocked", reason: outcome, message: AI_PLAN_LIMIT_MESSAGES[outcome] };
  } catch {
    return { status: "not_counted" };
  }
  return {
    status: "counted",
    // AI の失敗などで、この1回を戻す(足したのと同じ月の記録。日付が同じときだけ、今日の数も戻す)
    async refund() {
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const data = snap.exists ? snap.data() : undefined;
          if (!data) return;
          tx.set(
            ref,
            {
              total: Math.max(0, count(data.total) - 1),
              [service]: Math.max(0, count(data[service]) - 1),
              ...(data.day === day ? { dayTotal: Math.max(0, count(data.dayTotal) - 1) } : {}),
              updatedAt: new Date(),
            },
            { merge: true },
          );
        });
      } catch {
        // 戻せなくても、読み取りの応答は返す
      }
    },
  };
}
