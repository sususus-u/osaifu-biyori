// 知らせの文に、場面の絵(lib/scene-illust.jsx)を添えるかを決める(依頼366 仕事4)。純粋な関数(テストできる)。
// - 上限に届いた(ポイント・残高の数、AI の読み取りの回数、AI を休んでいる) → "limit"
// - 読み取り・通信・保存の失敗 → "error"
// - 入力の確かめ(「名前を入力してください。」など)は、絵を添えない(null。文だけ。かさばらないように)
export type NoticeScene = "error" | "limit";

const LIMIT_WORDS = ["上限", "休んでいます"];
const ERROR_WORDS = ["失敗しました", "読み取れ", "読み込めませんでした", "見つかりませんでした", "ありませんでした", "書き出せませんでした"];

export function sceneForMessage(message: string): NoticeScene | null {
  if (!message) return null;
  if (LIMIT_WORDS.some((w) => message.includes(w))) return "limit";
  if (ERROR_WORDS.some((w) => message.includes(w))) return "error";
  return null;
}
