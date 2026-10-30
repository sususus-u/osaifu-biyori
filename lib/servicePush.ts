// 期限のお知らせを、ホームの「代わりに送る」窓口(POST /api/service-push)から、スマホへ送る(依頼290)。
// 文の組み立てと、その人がホームの「通知設定」でおさいふびよりをオンにしているかの確かめ、回数の制限は、ホームの側で行う。
// - 合言葉(PUSH_RELAY_KEY)が無い・空のとき、ホームが断ったとき(503 など)、通信に失敗したときは、null を返す。
//   呼ぶ側は、今までどおり、おさいふびよりの送り方(FCM)で送る。
// - 1件ごとの結果のうち、ホームで届けられなかったもの(no_subscription・failed)だけ、今までの送り方に戻す。
//   off(ホームで、おさいふびよりの通知をオフにしている)と limited は、どこからも送らない(2重に届かないように)。
// ログには、件数と状態だけを出す(uid・名前・合言葉は出さない)。

import type { NotifyStage } from "./notificationSchedule.ts";

export const SERVICE_PUSH_URL = "https://okizukibiyori.com/api/service-push";
export const SERVICE_PUSH_SERVICE = "tamari-biyori";
export const SERVICE_PUSH_BATCH = 200;
export const SERVICE_PUSH_TIMEOUT_MS = 10000;

export type RelayItem = { uid: string; kind: "expiry-first" | "expiry"; name: string; days: number; ref: string };
export type RelayResult = "sent" | "off" | "no_subscription" | "limited" | "failed";

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

export function relayItem(input: { uid: string; stage: NotifyStage; name: string; days: number; accountId: string }): RelayItem {
  return {
    uid: input.uid,
    // 気づきのお知らせは、前の「1回目」と同じ種類(ホームの窓口の名前は変えない。依頼317)
    kind: input.stage === "reminder" ? "expiry-first" : "expiry",
    name: input.name,
    days: input.days,
    ref: input.accountId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100) || "x",
  };
}

// ホームで届けられなかったので、今までの送り方で送るもの
export function needsOwnSend(result: RelayResult | null): boolean {
  return result === null || result === "no_subscription" || result === "failed";
}

const RESULTS: RelayResult[] = ["sent", "off", "no_subscription", "limited", "failed"];

// 1件ごとの結果(items と同じ順)。ホームに頼めなかった分は null。
export async function relayViaHome(
  items: RelayItem[],
  key: string | undefined,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<(RelayResult | null)[]> {
  const out: (RelayResult | null)[] = items.map(() => null);
  if (typeof key !== "string" || key.trim() === "" || items.length === 0) return out;
  for (let i = 0; i < items.length; i += SERVICE_PUSH_BATCH) {
    const batch = items.slice(i, i + SERVICE_PUSH_BATCH);
    try {
      const res = await fetchImpl(SERVICE_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-push-relay-key": key },
        body: JSON.stringify({ service: SERVICE_PUSH_SERVICE, items: batch }),
        signal: AbortSignal.timeout(SERVICE_PUSH_TIMEOUT_MS),
      });
      if (res.status !== 200) continue;
      const data = (await res.json()) as { results?: unknown };
      const results = Array.isArray(data?.results) ? data.results : [];
      if (results.length !== batch.length) continue;
      results.forEach((r, j) => {
        out[i + j] = RESULTS.includes(r as RelayResult) ? (r as RelayResult) : null;
      });
    } catch {
      // この分は、今までの送り方で送る
    }
  }
  return out;
}
