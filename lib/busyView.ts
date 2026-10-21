// 写真の読み取り中の表示(BusyIndicator)に出す文言と、出す条件。純粋な関数(テストできる)。
export const BUSY_PREPARING = "画像を準備しています…";
export const BUSY_READING = "画像を読み取っています…";
export const BUSY_NOTE_PREPARING = "写真を小さくしています。少しお待ちください。";
export const BUSY_NOTE_READING = "読み取りは、数秒〜十数秒かかることがあります。このままお待ちください。";

export interface BusyView {
  title: string;
  note: string;
}

export function busyPreparing(): BusyView {
  return { title: BUSY_PREPARING, note: BUSY_NOTE_PREPARING };
}

export function busyReading(): BusyView {
  return { title: BUSY_READING, note: BUSY_NOTE_READING };
}

// スクショの読み取り(ScanUpload)。処理中だけ出す。statusMessage が空なら準備中、読み取りの文なら読み取り中、
// それ以外(「既存のサービスを確認しています」など)は、その文をそのまま出す
export function busyViewForScan(isProcessing: boolean, statusMessage: string): BusyView | null {
  if (!isProcessing) return null;
  if (statusMessage === "") return busyPreparing();
  if (statusMessage.includes("読み取って")) return busyReading();
  return { title: statusMessage.replace(/\.\.\.$/, "…"), note: "" };
}

// 切手の読み取り(ScanPhysicalUpload)。準備中が先、読み取り中が次。どちらも違えば出さない
export function busyViewForPhysical(isPreparing: boolean, isProcessing: boolean): BusyView | null {
  if (isPreparing) return busyPreparing();
  if (isProcessing) return busyReading();
  return null;
}

// 表示の状態を更新したあと、1フレーム描画させてから重い処理(縮小)を始めるために待つ。
// タブが隠れて rAF が来ないときは、100ms で先へ進む
export function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(), 100);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        setTimeout(() => {
          clearTimeout(t);
          resolve();
        }, 0);
      });
    }
  });
}
