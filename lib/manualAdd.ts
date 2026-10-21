// 手動の登録画面の「今回の分を追加する」の足し算を、トランザクションで行う(読み取りの保存 stampSave と同じ作り)。
// 足す対象の ID はクエリ(画面で選んだもの)で得て、トランザクションの中で読み直し、条件(名前・種類・額面)が
// まだ合うことを確かめてから、読み直した最新の値に足す。足し算と履歴(updates)は、同じトランザクションで書く。
// 純粋な関数(Firestore に依存しない)。偽の deps でテストする。
import { pickAddTarget, type ExistingItem } from "./stampMerge.ts";

export interface ManualAddTx {
  // 本人の項目を読む。なければ、他人の項目なら null
  get(id: string): Promise<ExistingItem | null>;
  update(id: string, fields: Record<string, unknown>): void;
  addHistory(id: string, record: Record<string, unknown>): void;
}

export interface ManualAddDeps {
  // fn が失敗(例外)したら何も書かない。競合したときは fn を呼び直してよい
  runTransaction<T>(fn: (tx: ManualAddTx) => Promise<T>): Promise<T>;
  now(): unknown; // 保存の日時(serverTimestamp)
}

export interface ManualAddInput {
  id: string; // 足す先(画面で選んだもの)
  name: string; // 画面に入力した名前(条件の確認に使う)
  category: string; // 画面の種類
  addBalance: number; // 今回の残高(加算)
  addQuantity: number; // 今回の枚数(加算)
  faceValue: number | null; // 画面の額面。入力があれば上書き、なければ読み直した値のまま
  extraFields: Record<string, unknown>; // 円換算レートなど、そのまま書く値
  historyExtra: Record<string, unknown>; // 履歴に書く期限など
}

export type ManualAddResult =
  | { ok: true; newBalance: number; newQuantity: number }
  | { ok: false; reason: "changed" };

export const MANUAL_ADD_CHANGED_MESSAGE = "状態が変わりました。もう一度、確認してください。";

export async function manualAdd(deps: ManualAddDeps, input: ManualAddInput): Promise<ManualAddResult> {
  return deps.runTransaction(async (tx) => {
    const fresh = await tx.get(input.id);
    // 条件(名前・種類・額面)が合わなくなっていたら、足さない。足し先の選び方は、画面と同じ共通の関数
    if (!fresh || pickAddTarget([fresh], { name: input.name, category: input.category }).target?.id !== input.id) {
      return { ok: false, reason: "changed" } as const;
    }
    const newBalance = (fresh.currentBalance ?? 0) + input.addBalance;
    const newQuantity = (fresh.itemQuantity ?? 0) + input.addQuantity;
    // 額面は1枚あたりの単価なので加算せず、入力があれば上書きする
    const newFaceValue = input.faceValue ?? fresh.faceValue ?? 0;
    const now = deps.now();
    tx.update(input.id, {
      currentBalance: newBalance,
      ...input.extraFields,
      faceValue: newFaceValue,
      itemQuantity: newQuantity,
      lastUpdatedAt: now,
      updatedAt: now,
    });
    tx.addHistory(input.id, {
      recordedAt: now,
      balance: newBalance,
      ...input.historyExtra,
      source: "manual",
      confirmedByUser: true,
    });
    return { ok: true, newBalance, newQuantity } as const;
  });
}
