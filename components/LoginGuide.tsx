"use client";

// ハブにログインしていないときに出す案内の画面。
// 出すのは、ブランド名・「ログイン」ボタン・規約とプライバシーポリシーへのリンクだけ。
// ハブへは自動では移動せず、必ずボタンを押してもらう。

import { useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { goToHubLogin } from "@/lib/hubLogin";

const HUB_TERMS_URL = "https://okizukibiyori.com/terms#おさいふびより";
const HUB_PRIVACY_URL = "https://okizukibiyori.com/privacy#おさいふびより";

export default function LoginGuide() {
  const { handoffFailed } = useAuth();
  const [blocked, setBlocked] = useState(false);

  function handleLogin() {
    // 移動できなかった(この起動ですでに1回移動している)ときは、メッセージを出す
    if (!goToHubLogin()) setBlocked(true);
  }

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

        {handoffFailed && (
          <p role="alert" style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
            ログインを引き継げませんでした。おさいふびよりを閉じて、もう一度開いてください
          </p>
        )}
        {blocked && (
          <p role="alert" style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
            ログインできませんでした。おさいふびよりを閉じて、もう一度開いてください
          </p>
        )}

        <button type="button" className="btn-primary" onClick={handleLogin} style={{ maxWidth: 280 }}>
          ログイン
        </button>

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
