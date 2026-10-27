// ハブ(/api/records/check)への、保存前の件数の確認。純粋な関数(通信は post で受けるので、テストでは本物を使わない)。
// 4アプリ合計の件数と上限の判断は、ハブがする。強制のスイッチがオフのとき、またはハブの集計が失敗したときは、ハブが ok: true を返す。
// 止めるのは、ハブが ok: false を返したときだけ。タイムアウト、通信の失敗、ハブの 5xx、形の違う返事は、許可として扱う
// (保存を止めない)。ログには種類だけ出す(トークン、uid、件数は出さない)。

export const HUB_CHECK_TIMEOUT_MS = 5000;

export interface HubCheckResponse {
  status: number;
  json(): Promise<unknown>;
}

// 上限で止めたことを、保存の流れ(saveStamps)から画面へ伝える
export class RecordLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordLimitError";
  }
}

const FALLBACK_MESSAGE = "ポイント・残高の数の上限に達しました。不要なポイント・残高を削除するか、プランの変更をご検討ください。";

export type HubCheckResult = { ok: true } | { ok: false; message: string };

export async function checkCreate(
  adding: number,
  post: (adding: number, signal: AbortSignal) => Promise<HubCheckResponse>,
  log: (kind: string) => void = (kind) => console.error("records-check:", kind),
  timeoutMs = HUB_CHECK_TIMEOUT_MS,
): Promise<HubCheckResult> {
  if (!Number.isInteger(adding) || adding <= 0) return { ok: true };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, timeoutMs);
    });
    const res = await Promise.race([post(adding, controller.signal), timeout]);
    if (res.status !== 200) {
      log(res.status >= 500 ? "hub-5xx" : "hub-http");
      return { ok: true };
    }
    const body = (await Promise.race([res.json(), timeout])) as { ok?: unknown; message?: unknown } | null;
    if (!body || typeof body.ok !== "boolean") {
      log("bad-response");
      return { ok: true };
    }
    if (body.ok) return { ok: true };
    return { ok: false, message: typeof body.message === "string" && body.message ? body.message : FALLBACK_MESSAGE };
  } catch (e) {
    log(e instanceof Error && e.message === "timeout" ? "timeout" : "network");
    return { ok: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
