"use client";

// 切手の保存後、一覧の画面の上部に案内を4秒出す。タップで閉じる。
// 案内は切手の画面が sessionStorage に入れたもの(lib/stampToast.ts)。キーがなければ何も出さない。
import { useEffect, useState } from "react";
import { STAMP_TOAST_MS, takeStampSavedMessage } from "@/lib/stampToast";

export default function StampSavedToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const taken = takeStampSavedMessage(window.sessionStorage);
    // sessionStorage は開くまで読めず(サーバーの描画と食い違わせない)、読んだら消すので、開いた直後に一度だけ読む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (taken) setMessage(taken);
  }, []);

  // 表示した文ごとに、4秒で閉じる(開発時の二重実行でも、タイマーが消えたままにならないよう分ける)
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), STAMP_TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div aria-live="polite" role="status" style={{ position: "sticky", top: 8, zIndex: 50 }}>
      {message && (
        <button
          type="button"
          onClick={() => setMessage(null)}
          aria-label="案内を閉じる"
          style={{
            display: "block",
            width: "calc(100% - 24px)",
            margin: "8px 12px 0",
            padding: "12px 14px",
            textAlign: "left",
            fontSize: 14,
            lineHeight: 1.6,
            color: "#2a7a3b",
            background: "#fff",
            border: "1px solid #2a7a3b",
            borderRadius: "var(--radius-card)",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)",
            whiteSpace: "pre-line",
          }}
        >
          {message}
        </button>
      )}
    </div>
  );
}
