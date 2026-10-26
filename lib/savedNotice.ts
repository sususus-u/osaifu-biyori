// 編集の画面の「更新する」「登録する」「削除する」のあと、一覧に戻ったときに画面の下に出す知らせ(依頼231)。
// 一覧へは stampToast.ts の仕組み(sessionStorage に1回分)で渡す。更新と登録は、その行に印(左の端の線)を付ける。
// 登録と更新は「元に戻す」付き(依頼232。登録は取り消し、更新は直す前の中身に戻す)。削除は、履歴も消えるので、戻せない。
import { displayAccountName } from "./stampMerge.ts";
import type { StampSavedPayload } from "./stampToast.ts";
import type { RestoreChange } from "./undoRestore.ts";

export const UNDO_FAILED_MESSAGE = "取り消しに失敗しました。もう一度お試しください。";

const label = (name: string) => `「${displayAccountName(name.trim())}」`;

export function updatedNotice(id: string, name: string, restore: RestoreChange): StampSavedPayload {
  const text = `${label(name)}を更新しました`;
  return { message: text, items: [{ id, kind: "add", text }], undo: { createIds: [], restores: [restore] } };
}

export function createdNotice(id: string, name: string): StampSavedPayload {
  const text = `${label(name)}を登録しました`;
  return { message: text, items: [{ id, kind: "create", text }], undo: { createIds: [id], restores: [] } };
}

// 残高が続く種類の「失効した」(依頼234): 残高を0にし、記録を足す。元に戻すと、直す前の値に戻し、記録を消す
export function expiredNotice(id: string, name: string, restore: RestoreChange, outcomeId: string): StampSavedPayload {
  const text = label(name) + "の失効を記録しました";
  return {
    message: text,
    items: [{ id, kind: "add", text }],
    undo: { createIds: [], restores: [restore], outcomeIds: [outcomeId] },
  };
}

export function deletedNotice(name: string): StampSavedPayload {
  return { message: `${label(name)}を削除しました`, items: [] };
}
