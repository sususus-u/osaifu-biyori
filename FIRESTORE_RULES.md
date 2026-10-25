# Firestore のルールについて

- ルールの正本は、ハブ(okizukibiyori-hub)の `firestore-rules/firestore.rules.txt`。
- このリポジトリには、ルールを置かない(古い写しは、2026-10-25 に消した)。
- 公開は、Firebase コンソール(okizukibiyori → Firestore Database → ルール)で行う。
  ハブの正本の「rules_version」の行から最後までを貼りかえて、公開する。
- このリポジトリの firebase.json には、ルールの指定を置かない(`firebase deploy` でルールが公開されないように)。
