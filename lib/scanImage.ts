// 写真読み取り(scan-account / scan-physical-count)で使う、画像の縮小と、応答の読み取り。
// スマホの写真は数MBあり、そのまま base64 で送ると Vercel の本文上限(約4.5MB)を超えて 413 になるため、
// 送る前に縮小する。応答が JSON でなくても、生の例外(Unexpected token など)を画面に出さない。

export const SCAN_IMAGE_MAX_EDGE = 2000;
export const SCAN_IMAGE_QUALITY = 0.8;

export const SCAN_TOO_LARGE_MESSAGE =
  "写真が大きすぎて読み取れませんでした。もう一度、撮り直してください";
const SCAN_FAILED_MESSAGE = "読み取りに失敗しました";

// 長辺が max を超えるときだけ、縦横比を保って縮める(拡大はしない)
export function computeTargetSize(width: number, height: number, max = SCAN_IMAGE_MAX_EDGE) {
  const longEdge = Math.max(width, height);
  if (longEdge <= max) return { width, height };
  const scale = max / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 画像を長辺 2000px・JPEG 品質 0.8 に縮めて base64 にする。
// 縮小できない場合(形式を読めない端末など)は、元のファイルをそのまま base64 にする(従来どおり)。
export async function prepareScanImage(file: File): Promise<{ base64: string; mediaType: string }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = computeTargetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", SCAN_IMAGE_QUALITY)
    );
    if (!blob) throw new Error("toBlob failed");
    return { base64: await blobToBase64(blob), mediaType: "image/jpeg" };
  } catch (error) {
    console.error(error);
    return { base64: await blobToBase64(file), mediaType: file.type };
  }
}

// 読み取りAPIの応答を JSON として読む。失敗(413、JSONでない応答、error 付き)は、
// 利用者向けの文言の Error を投げる。上限到達などサーバーの案内文(error)は、そのまま使う。
export async function readScanJson<T>(res: Response): Promise<T> {
  if (res.status === 413) throw new Error(SCAN_TOO_LARGE_MESSAGE);
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data || data.error) {
    throw new Error((data && data.error) || SCAN_FAILED_MESSAGE);
  }
  return data;
}
