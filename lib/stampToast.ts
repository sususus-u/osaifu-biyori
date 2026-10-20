// 切手の保存後の案内を、切手の画面から一覧の画面へ渡す(画面が切り替わると、切手の画面の表示は消えるため)。
// sessionStorage に1回分だけ入れ、一覧が開いたときに読んで、すぐ消す。storage は引数で受けるので、テストでは偽物を使う。
export const STAMP_SAVED_MESSAGE_KEY = "tamari:stampSavedMessage";
export const STAMP_TOAST_MS = 4000;

export interface MessageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// 入れる。storage が使えない(例外)ときは、黙って何もしない(保存そのものは済んでいる)
export function stashStampSavedMessage(storage: MessageStorage | null, message: string): void {
  if (!storage || message.trim() === "") return;
  try {
    storage.setItem(STAMP_SAVED_MESSAGE_KEY, message);
  } catch {
    // 案内が出ないだけ
  }
}

// 読んで、すぐ消す。なければ、読めなければ null
export function takeStampSavedMessage(storage: MessageStorage | null): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(STAMP_SAVED_MESSAGE_KEY);
    storage.removeItem(STAMP_SAVED_MESSAGE_KEY);
    return value && value.trim() !== "" ? value : null;
  } catch {
    return null;
  }
}
