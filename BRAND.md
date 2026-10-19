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
