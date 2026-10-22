<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 作業の始めと終わりの決まり

### 1. 作業の始め(どの PC でも)
- `git fetch` で、手元と origin を比べる。手元が遅れていれば pull する。未コミットの変更がある場合は、pull せず、内容を報告する。
- 最新のコミット3つ(識別子、日時、説明)と、最新の本番デプロイの状態を報告する。

### 2. 作業の終わり
- コミットされていない変更、push 済みか、本番デプロイが Ready か、一時的な差し替えや確認用のファイルが残っていないかを確認する。
- 報告の最後に、「引き継ぎメモに書く内容」を、4項目で書く(本番に出したもの、確認したこと、確認していないこと、次にやること)。

### 3. 別の PC で作業した日
- その日のうちに push する。
- 手元の変更を捨てる前に、差分を表示して、内容が同じか確認する。

### 4. 本番に出す前の確認(脆弱性対策)
- 誰が実行できるか(ログインの確認が、サーバー側にもあるか)。
- 悪意のある入力でも安全か(検証、長さの制限)。
- 秘密の値が、ログ、URL、画面に出ないか。
- 失敗したときに戻せるか(戻す先のデプロイを控える)、被害が広がらないか。
- 確認できていない点は、「確実」と書かず、「未確認」と書く。

### 5. 報告の書き方
- 冒頭に、このアプリの名前を書く。各項目は短くする(貼り付けが切れないように)。
- 依頼の番号: 利用者の依頼に番号(「依頼59」「【依頼59】」など)が書かれているときは、報告の1行目を「【依頼59の報告】」の形で始める。番号が複数あるときは、番号ごとに、別の見出し(「【依頼50の報告】」「【依頼53の報告】」)で報告する。番号が書かれていない依頼には、付けない。依頼の文に、報告の見出しの形が指定されていれば、それに従う。見出しのあとに、名乗り(アプリの名前)から始まる本文(決まりの1行など)を書く。
- このアプリは『おさいふびより』(旧名: たまりびより。リポジトリ名 osaifu-biyori、旧リポジトリ名 mimamori-point-app)。報告の冒頭には、『おさいふびより』と書く。
  『まもりびより』は、別のアプリ(mamori-biyori。旧: mimamori-hoken-app)なので、間違えない。
- 決まりの確認(型チェック、lint、ビルド、テスト、Ready、ヘッダー、ログインなしのAPIの401など)が、すべて予想どおりに通ったときは、報告は次の1行だけにする。
  「【名乗り】OK。コミット○○、デプロイReady。」
- 予想と違うこと、確認できなかったこと、判断が要ることがあるときだけ、その点をくわしく書く(通ったものは、くり返さない)。
- 調査の報告は、これまでどおり、項目ごとに書く。
- 鍵、uid、メールアドレス、トークンは、どの報告にも書かない。

### 6. 状況の正本
- 状況の正本は、ハブのリポジトリの BRAND.md 26章「引き継ぎメモ」。このリポジトリからは読めないので、報告の4項目を、利用者がハブへ伝える。

## 名前の決まり

- ブランド(正式): おきづきびより。ドメイン okizukibiyori.com。
- ハブ: 画面の名前「おきづきびより」。リポジトリ kizuki-biyori-hub(次に変える予定。変わったら、改めて直す)。Claude Code の名乗り「ハブ」。
- まもりびより: 画面の名前「まもりびより」。リポジトリ mamori-biyori(旧: mimamori-hoken-app)。名乗り「まもりびより」。旧名: みまもり保険手帳。
- たべびより: 画面の名前「たべびより」。リポジトリ tabe-biyori(旧: tabegoro-app)。名乗り「たべびより」。旧名: たべゴロっとチェック。
- おさいふびより: 画面の名前「おさいふびより」。リポジトリ osaifu-biyori(旧: mimamori-point-app)。名乗り「おさいふびより」。旧名: たまりびより、まもりポイント。
- 注意: 旧名が似ていたので、取り違えやすかった。現在は、まもりびより=mamori-biyori、おさいふびより=osaifu-biyori。
- 内部の識別子(tamari-biyori、usage_counts_tamari、tamari:、tabegoro:、tabe-biyori など)は、旧名のまま変えない。
  変えると保存データの移行が要るため。画面の名前とは、別物。
- 報告の冒頭には、このアプリの「名乗り」を書く。
