"use client";

// ログインしていないときの画面(依頼345 の決定2・3)。
// ログインのボタンは置かない。開いたら、自動でホームのログインへ移り、済んだら元の画面に戻る(lib/login-handoff.ts の goToHubLogin)。
// うまくいかないとき(引き継げなかった・この起動ですでに1回移った・控えられない)だけ、
// 「ログインを引き継げませんでした。おさいふびよりを閉じて、もう一度開いてください」を出す(往復しないため、自動では移らない)。

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { handoffEnv } from "@/lib/firebase";
import { goToHubLogin, handoffFailedMessage, LOGIN_HANDOFF_PRESETS } from "@/lib/login-handoff";

const HUB_TERMS_URL = "https://okizukibiyori.com/terms#おさいふびより";
const HUB_PRIVACY_URL = "https://okizukibiyori.com/privacy#おさいふびより";

export default function LoginGuide() {
  const { handoffFailed } = useAuth();
  const [blocked, setBlocked] = useState(false);
  // 1回だけ移る(開発の StrictMode で effect が2回走っても、2回目で失敗の文を出さないように)
  const triedRef = useRef(false);

  useEffect(() => {
    if (handoffFailed || triedRef.current) return;
    triedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 移れなかったときだけ、失敗の文に切り替える
    if (!goToHubLogin(handoffEnv())) setBlocked(true);
  }, [handoffFailed]);

  // 移っている間は、何も出さない(一瞬の点滅を避ける)
  if (!handoffFailed && !blocked) return <div className="app-shell" />;

  return (
    <div className="app-shell">
      <main
        className="scroll"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 16,
          paddingBottom: 20,
        }}
      >
        <h1 className="appbar-title" style={{ color: "var(--brand)", fontSize: 26 }}>
          おさいふびより
        </h1>

        <p role="alert" style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
          {handoffFailedMessage(LOGIN_HANDOFF_PRESETS.osaifu.serviceName)}
        </p>

        <nav style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <a href={HUB_TERMS_URL} style={{ color: "var(--text-muted)" }}>
            利用規約
          </a>
          <a href={HUB_PRIVACY_URL} style={{ color: "var(--text-muted)" }}>
            プライバシーポリシー
          </a>
        </nav>
      </main>
    </div>
  );
}
