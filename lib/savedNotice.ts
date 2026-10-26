// 編集の画面の「更新する」「登録する」「削除する」のあと、一覧に戻ったときに画面の下に出す知らせ(依頼231)。
// 一覧へは stampToast.ts の仕組み(sessionStorage に1回分)で渡す。更新と登録は、その行に印(左の端の線)を付ける。
// 登録は「元に戻す」(登録を取り消す)付き。削除は、履歴も消えるので、戻せない。
import { displayAccountName } from "./stampMerge.ts";
import type { StampSavedPayload } from "./stampToast.ts";

export const UNDO_DONE_MESSAGE = "登録を取り消しました";
export const UNDO_FAILED_MESSAGE = "取り消しに失敗しました。もう一度お試しください。";

const label = (name: string) => `「${displayAccountName(name.trim())}」`;

export function updatedNotice(id: string, name: string): StampSavedPayload {
  const text = `${label(name)}を更新しました`;
  return { message: text, items: [{ id, kind: "add", text }] };
}

export function createdNotice(id: string, name: string): StampSavedPayload {
  const text = `${label(name)}を登録しました`;
  return { message: text, items: [{ id, kind: "create", text }], undoIds: [id] };
}

export function deletedNotice(name: string): StampSavedPayload {
  return { message: `${label(name)}を削除しました`, items: [] };
}
