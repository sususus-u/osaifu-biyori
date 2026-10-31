// 依頼317 仕事2: 文字を減らす見直し(1回目)と、見せる段階を分ける。
// 正本はハブの BRAND.md 5章「文字を減らす決まりと「くわしく見る」」。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const has = (src: string, s: string) => assert.ok(src.includes(s), s);
const lacks = (src: string, s: string) => assert.ok(!src.includes(s), "残っている: " + s);

test("共通の「くわしく見る」: 区切りの線、14px・太さ500、印は「+」「−」24px、行全体が44px以上のボタン、はじめは閉じている", () => {
  const src = read("../components/MoreDetails.tsx");
  has(src, 'export const MORE_DETAILS_LABEL = "くわしく見る";');
  has(src, 'borderTop: "1px solid #eee"');
  has(src, 'type="button"');
  has(src, "aria-expanded={open}");
  has(src, "aria-controls={id}");
  has(src, "minHeight: 44,");
  has(src, "fontSize: 14,\n          fontWeight: 500,");
  assert.match(src, /const MARK_STYLE = \{[^}]*fontSize: 24,[^}]*fontWeight: 400,[^}]*lineHeight: 1,/);
  has(src, '{open ? "−" : "+"}');
  has(src, "useState(false)");
  has(src, "hidden={!open}");
});

test("① 現物の読み取り: 前の長い文は無くなり、短い文と「くわしく見る」になった。間違いを防ぐ注意は出したまま", () => {
  const src = read("../components/ScanPhysicalUpload.tsx");
  for (const s of [
    "現物を並べて撮影してください。枚数・額面をAIが数えて合計金額を算出します。",
    "読み取り精度が写真の状態に左右されやすいため",
    "読み取り精度が上がります。",
    "額面ごとに行を分けて入力できます。合計は行から自動で計算します",
    "切手など重なって見えるものは、枚数を多く数えてしまうことがあります。",
    "1枚だけ撮影した場合の初期値です。",
  ]) {
    lacks(src, s);
  }
  // 出したまま(短く)
  has(src, "切手や紙の商品券を並べて撮ると、AI が額面と枚数を数えます。");
  has(src, "読み違えることがあります。登録の前に、内容を確かめてください。");
  has(src, "重なった切手は、多く数えることがあります。実際の枚数に直してください。");
  has(src, "1枚だけ撮ったときの枚数です。持っている枚数に直すと、合計を計算します。");
  has(src, "{MSG_TOO_MANY}");
  has(src, "{MSG_BREAKDOWN_SUSPECT}");
  // 「くわしく見る」の中(補足)
  assert.equal(src.split("<MoreDetails").length - 1, 2);
  has(src, "明るい場所で、正面からピントを合わせて撮ると、読み取りやすくなります。");
  has(src, "額面ごとに行を分けて入れられます。合計は、行から自動で計算します。");
  // AI の読み取りの失敗の文は、閉じない(言葉の決まりのとおり)
  has(src, '"読み取りに失敗しました。もう一度お試しいただくか、手入力で登録してください。"');
});

test("② 登録・編集: 補足は「くわしく見る」へ。読み取りの自信がない注意と、お知らせの時期は出したまま", () => {
  const src = read("../components/AccountForm.tsx");
  lacks(src, "同じグループ名を付けておくと、一覧の「発行元別」タブでまとめて表示されます");
  lacks(src, "未入力の場合は1pt=1円として表示されます");
  lacks(src, "空欄の場合は「期限なし」タブに表示されます");
  has(src, "サービス名だけを入れます（例:PayPay）。");
  has(src, "例:200ポイント=1000円なら、200と1000を入れます。");
  assert.equal(src.split("<MoreDetails>").length - 1, 3);
  has(src, "読み取りに自信が持てませんでした。画像と見比べて、残高を確認してください。");
  has(src, "読み取りに自信が持てませんでした。画像と見比べて、期限を確認してください。");
  // 仕事1 の「お知らせの時期」は、そのまま(閉じない)
  has(src, "{REMINDER_SECTION_LABEL}");
  has(src, "{REMINDER_CAPTION}");
  has(src, "{DAILY_CAPTION}");
  // 確認の画面の決まった文は、閉じない
  has(src, 'description="元に戻せません。履歴も一緒に消えます。"');
  // 「くわしく見る」は、お知らせの時期より前にだけ(お知らせの時期を隠さない)
  assert.ok(src.lastIndexOf("<MoreDetails>") < src.indexOf("{REMINDER_SECTION_LABEL}"));
});

test("呼び名は、ホームの1か所だけで変える(依頼366 仕事1)。メニューに呼び名の行は置かない(依頼372)", () => {
  const menu = read("../app/menu/page.tsx");
  lacks(menu, "呼び名:");
  lacks(menu, "HUB_NAME_LINK_TEXT");
  lacks(menu, "<input");
  assert.equal(existsSync(new URL("../components/AccountSettings.tsx", import.meta.url)), false);
});
