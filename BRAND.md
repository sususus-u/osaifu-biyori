# おさいふびより ブランドガイド(旧名: たまりびより)

このドキュメントは「おさいふびより」(このリポジトリ: `osaifu-biyori`。旧名: `mimamori-point-app`) 固有の
ブランド情報のみをまとめたものです。

フォント・角丸・アイコンスタイル・配色の管理方法など、きづきびよりブランド全体に関わる
ルールは、ハブアプリ(`kizuki-biyori-hub`)の `BRAND.md` を「本家」として参照してください。
ここでは重複して書きません。

## 配色

| 用途 | 値 |
| --- | --- |
| ブランドカラー | 小豆色 `#6E2A32` |
| 背景色 | オフホワイト `#F7F1EC` |

「たまる/貯まる」という名前の響きと重なる、渋め・和風寄りの配色。

## 警告色について

期限切れ・未更新などを目立たせる警告表示は、ブランドカラー(小豆色)とは別の意味を持つ
セマンティックカラーとして扱い、アンバー系(暖色の薄い黄橙)を使用します。
ブランドカラーと警告色を混同させないための意図的な設計判断です。

## モチーフ

しずくがたまる

## アカウント削除の窓口

/api/account-data は、段階3を本番に出した(本人のIDトークンと合言葉の両方が必須)。

## CSP(Content-Security-Policy)
- 報告専用(Content-Security-Policy-Report-Only)で入れた。強制はしていない。場所は next.config.ts の headers()。
- script/style は 'unsafe-inline'(Next.js のインライン用)。nonce は使わない。
- 強制へ切り替える手順: (1) 本番の画面(ログイン引き継ぎ、一覧、写真読み取り、通知)をブラウザの Console で開き、違反が出ないか見る。(2) 出た許可先を next.config.ts に足す。(3) 違反が無くなったら、キーを Content-Security-Policy に変える。(4) デプロイ後、同じ画面を確認。問題があれば戻す。
- 報告の送り先(report-uri)は未設定。Console で確認する。
- 2026-10 に強制へ切り替えた(キーは Content-Security-Policy。内容は報告専用のときと同じ)。
- 問題が出たとき(画面が出ない、ログインできない、文字や画像が出ない)の戻し方: (1) 直前の本番デプロイ(報告専用だった f1e41e9 のデプロイ)を、Vercel で Promote(または `vercel rollback`)。これが最速。(2) 恒久的には、next.config.ts のキーを Content-Security-Policy-Report-Only に戻して push。(3) 戻したあと、Console の違反から、足りない許可先を調べる。

## アイコンとロゴ
- ハブのしずく(`TamariBiyoriIcon`。viewBox 24、線画、線幅1.5、丸端)と同じパス・同じ色。丸の背景 `#f3e1e3`、線 `#6e2a32`、右上の点 `#ad8a4c`(点は、ハブと同じく塗りの円)。
- 元の絵: `assets/icon.svg`(丸)と `assets/icon-maskable.svg`(四角。maskable と apple 用)。点は viewBox の外に出るので、512の枠に拡大して中央に置き直している(拡大11倍)。
- 作り方: `node scripts/generate-icons.mjs`(sharp)。`public/` の icon-192、icon-512、icon-maskable-512、apple-touch-icon(180)と、`app/favicon.ico`(16/32/48)ができる。生成物はコミットし、ビルドでは実行しない。
- 読み込み: `app/layout.tsx` の metadata.icons、`app/manifest.ts`(theme/background は画面の背景 `#f7f1ec`)。画像は自分のドメインだけ(CSP に足したものはない)。
- 画面の上のバー: `components/DropMark.tsx`(26px)を、appbar-brand の文字の左に置く。
- 色や形を変えたら、assets の SVG を直して、generate-icons を実行し直す。
- 絵の差し替え(しずく → カード+小さなしずく): ハブのカードと同じ絵にした。理由: 名前「おさいふ」との関連が、しずくだけでは分かりづらかったため。形(viewBox 24、線幅1.5、丸端): カード `rect x3 y6 w18 h13 rx2.5`、横線 `M3 10h18`、しずく(カードの右下)、金の点 `circle cx22 cy-1 r4.35`(絵の右上の外)。色は変えていない。点を含めた全体が512の枠の中央に来るよう、拡大11倍・移動(98.7, 176.8)にした(丸でも、maskable の安全領域80%でも、点は切れない)。上のバーは `components/CardMark.tsx`(DropMark から名前を変えた。viewBox `2 -6 25 26`)。
- しずくの位置(カードの右下 → 左側): しずくの path を `M8.6 12.2…`(中心 x≒7.6)に変えた。理由: 金の丸も含めて、絵全体の重心が右に寄っていたため。カード、横線、金の点、色、拡大・移動は変えていない(しずくはカードの中なので、全体の範囲は同じ)。変えた場所: assets の2つの SVG、`components/CardMark.tsx`、生成した PNG と favicon。ファイル名は変えていない(キャッシュの注意は次の項目と同じ)。
- アイコンのキャッシュ: ファイル名は変えていない(manifest も layout も同じ)。Next は public の画像を `max-age=0` で配るため、再読み込みで新しい絵になる。ただし、タブのアイコン(favicon)と、ホーム画面に追加済みのアイコンは、端末側で長く残ることがある。残るときは、ブラウザのキャッシュを消す、ホーム画面のアイコンを一度消して入れ直す。それでも困るなら、ファイル名にバージョンを付ける(例: icon-192-v2.png。manifest と layout の参照も変える)。

## lint の整理の方針
- 2026-10 に、lint の指摘18件を整理して、0件にした(動作は変えない)。
- 直したもの: ScanPhysicalUpload の使わない変数 existingFaceValue(値を捨て、更新関数だけ残す)。AccountForm の setBalanceUnitFromValue を、effect より前へ移した(処理は同じ)。
- 理由付きの除外(その行だけ eslint-disable): (1) AccountForm の exhaustive-deps(名前の自動入力の effect)。name は groupName の変更時だけ読み、その時点の値は最新。依存に足すと、名前を手で消したとき自動入力が再発火して消せなくなる。(2) AccountForm の no-location-assign-relative-destination(3か所)。/accounts/new を全画面で作り直すための遷移で、router.push に変えると再読み込みされず動作が変わる。
- 緩めたルール: react-hooks/set-state-in-effect を、eslint.config.mjs の overrides で、6ファイル(app/reports/page.tsx、AccountForm、AppShell、NotificationSetup、QuickUpdate、ScanPhysicalUpload)だけ切った。理由は、保存値や画面の大きさを描画後に読んで state に入れる作りで、直すと初期表示(ちらつき、ハイドレーション)が変わるおそれがあるため。新しいファイルには効いたまま。
- 直さずに残したもの: 上の set-state-in-effect の12か所の書き方そのもの。直すなら、1か所ずつ、画面を確認しながら。
- 注意: 新しい eslint-disable や overrides を足すときは、ここに理由を足す。

## 写真読み取りの画像と応答
- 送る前に、画像を長辺2000px・JPEG品質0.8に縮める(定数 SCAN_IMAGE_MAX_EDGE。最初は1600pxだったが、切手の細い額面や名前の文字が1600pxでつぶれ、name が null になった可能性があるため、2000pxに上げた。縮小後は、ノイズだらけの最悪の画像でも約1.3MB(base64で約1.7MB)で、本文の上限4.5MBに十分収まる)(`lib/scanImage.ts` の `prepareScanImage`)。スマホの写真は数MBで、base64 にすると Vercel の本文上限(約4.5MB)を超えて 413 になっていたため。使う場所: ScanUpload(scan-account)、ScanPhysicalUpload(scan-physical-count)、AccountForm のカメラ起動(sessionStorage 経由)。縮小できない端末では、元の画像をそのまま送る(従来どおり)。
- 応答は `readScanJson` で読む。413 は「写真が大きすぎて読み取れませんでした。もう一度、撮り直してください」。JSON でない応答は「読み取りに失敗しました」。上限到達などサーバーの案内文は、そのまま出す。
- scan-physical-count の指示に、切手向けの説明(小さな額面、シートは行×列、期限なし)と、額面ごとの小計 breakdown(合計と一致させる、読めなければ null)を足した。scan-account の指示と、モデル(claude-haiku-4-5)は変えていない。
- 戻し方: 画像の扱いに問題が出たら、`prepareScanImage` の中身を元のファイルの base64 化に戻す(1関数)。
- テスト: `lib/scanImage.test.ts`(縮小サイズの計算、413 などの応答)。画面そのもののテストはない。
- 切手の name: 切手の写真では、name を「切手」とする(指示に1文)。切手には名前が印刷されないため、これまでは name が null になり、「文字を読み取れませんでした」が出て、名前が空のまま保存が止まっていた。商品券・ギフトカードなど、切手以外の name の指示(自信がなければ null)は変えていない。指示の文面は `lib/physicalScanPrompt.ts`(route.ts から移した。テストは `lib/physicalScanPrompt.test.ts`。AI は呼ばない)。

- 切手の読み取りのばらつきを減らす(診断ログの結果: 同じような写真で、成功する回と、全項目が null になる回があった。stop_reason は end_turn で、AI の答えのばらつき)。(1) 指示を直した: 「読めない枚があれば totalAmount を null」をやめ、「読めた額面だけで itemCount と totalAmount を出す。読めなかった枚は、breakdown に { faceValue: null, count, unreadable: true } で書く(itemCount と totalAmount には含めない)。1枚も読めないときだけ null」にした。(2) 画面: 全項目が null のときは、フォームを出さず「写真から切手を読み取れませんでした。明るい場所で、真上から、もう一度撮ってください」を出す。name だけが null のときの案内は変えていない。読めなかった枚があるときは、その枚数が合計に入っていないことを画面に出す(黙って少なく登録されないように)。(3) 枚数の上限: 1回100枚を目安にした。案A(撮る前の案内)と案B(結果の itemCount が上限を超えたら警告)を比べ、案Bにした。理由: 案Aは読まれにくく、実際の枚数と関係なく出る。案Bは実際に数えた結果で出せる。登録は止めない(数え間違いのこともあるため)。AI への指示には上限を入れていない(超える写真で、AI が数えなくなるおそれがあるため)。上限の数は `lib/physicalScanResult.ts` の `MAX_ITEMS_PER_SCAN`(100)。調整の考え方: 100枚超の写真で、数え間違いが多ければ下げる。100枚以内でも警告が必要なほど間違えるなら下げ、警告が多すぎて邪魔なら上げる。実機で確かめてから変える。
- 効果が足りないときの次の手: モデルを claude-haiku-4-5 から上のモデルに上げる(`app/api/scan-physical-count/route.ts`)。読み取りの費用が上がり、速度は遅くなる。上げるときは、費用と1日の回数の上限を見直す。診断ログ(下のセクション)は、この効果の確認が済むまで残す。
- 診断ログの扱い: 今回の変更では取り消さない(効果の確認が済んでから、下の手順で取り消す)。

## 【一時的】切手の読み取りの診断ログ
- 目的: 切手の読み取りで name が毎回 null になる原因を調べる。診断が済んだら取り消す。
- 内容: `app/api/scan-physical-count/route.ts` が、AI の応答を読んだ直後に console.warn する(印「[scan-physical-count 診断]」)。出すのは、name が null か文字列か(文字列なら文字数と先頭5文字)、itemCount・totalAmount・faceValuePerItem が null か数値か(数値は出さない)、stop_reason だけ。応答全体、画像、uid、メールアドレスは出さない。応答が JSON として読めなかったときも、stop_reason を出す。
- 見かた: 試した直後に、Vercel の Logs で「[scan-physical-count 診断]」を検索する(無料プランのログは約1時間で消える)。
- 取り消す手順: (1) `lib/scanDiagnostic.ts` と `lib/scanDiagnostic.test.ts` を消す。(2) route.ts の「診断(一時的)」と書いた5行を消す(import 1、変数 1、代入 1、warn 2)。(3) package.json の test から scanDiagnostic.test.ts を外す。(4) このセクションを消す。(5) 型チェック・lint・ビルド・テストを通して push。

## 写真を縮めている間の表示
- 撮った写真を縮める間(数秒かかることがある)、「画像を準備しています...」を出す。登録フォームの「現物を撮影して登録」(AccountForm、縮小が終わるまで画面が変わらないため)と、切手画面(ScanPhysicalUpload)。縮小が終わる、または失敗すると消える(finally)。失敗したときは「画像を読み込めませんでした。もう一度、撮り直してください」を出す。
- スクショ読み取り(ScanUpload)には、まだ付けていない。
- 画面の描画のテストはない。確認は手で行う。
