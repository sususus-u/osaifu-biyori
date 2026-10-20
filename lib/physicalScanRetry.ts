// 全項目 null の応答、または JSON として読めない応答だったとき、同じ画像で1回だけ AI を呼び直す(合計で1回まで)。
// 呼び出し(callAi)は引数で受けるので、テストでは本物の AI を呼ばない。利用回数は呼び出し側で1回だけ数える。
import { isNothingRead, type PhysicalScanResponse } from "./physicalScanResult.ts";

// 1回目にこの時間(ミリ秒)より長くかかったら、関数の時間制限(maxDuration)を超えないよう再試行しない
export const RETRY_SKIP_AFTER_MS = 25_000;

export interface ScanAttempt {
  // JSON として読めなかったときは null(parseFailed が true)
  parsed: PhysicalScanResponse | null;
  stopReason: string | null;
  parseFailed?: boolean;
}

// 読めた結果が得られなかったか(JSON が読めない、または全項目 null)
export function needsRetry(a: ScanAttempt): boolean {
  return a.parsed === null || isNothingRead(a.parsed);
}

export async function readWithRetry(
  callAi: () => Promise<ScanAttempt>,
  now: () => number = Date.now
): Promise<{ attempts: ScanAttempt[]; retried: boolean; skippedBySlow: boolean }> {
  const start = now();
  const first = await callAi();
  if (!needsRetry(first)) return { attempts: [first], retried: false, skippedBySlow: false };
  if (now() - start > RETRY_SKIP_AFTER_MS) return { attempts: [first], retried: false, skippedBySlow: true };
  try {
    const second = await callAi();
    return { attempts: [first, second], retried: true, skippedBySlow: false };
  } catch {
    // 再試行が失敗しても、1回目の結果を返す
    return { attempts: [first], retried: true, skippedBySlow: false };
  }
}
