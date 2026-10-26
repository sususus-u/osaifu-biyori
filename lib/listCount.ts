// 一覧の見せ方の決まり(依頼236。3つのサービス共通): 一覧の最後に、小さな灰色の文字で、真ん中に件数を出す。
//   - 「全○件」。しぼりこみ中は「全○件中 ○件」。
//   - ゼロ件のときは出さない(点線の枠の「まだ○○が登録されていません。」を出す)。
// おさいふびよりは、閉じている月の分も数に入れる(タブの中の全部の件数)。
export function listCountText(total: number, shown: number = total): string | null {
  if (total <= 0) return null;
  return shown === total ? `全${total}件` : `全${total}件中 ${shown}件`;
}

export const LOADING_TEXT = "読み込み中…";
