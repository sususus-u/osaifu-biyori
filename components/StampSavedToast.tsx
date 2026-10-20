"use client";

// 一覧の上部のトースト。切手の保存後の案内を、該当の行が一覧に見つからないときの代わりに出す。
// 見つかった行には、行の下の案内(StampRowNotice)を出すので、こちらは二重に出さない。タップで閉じる。
import { useEffect, useRef } from "react";

export default function StampSavedToast({
  message,
  durationMs,
  onClose,
}: {
  message: string;
  durationMs: number;
  onClose: () => void;
}) {
  // 親が再描画しても、表示時間が延びないよう、閉じる関数は ref で持つ
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const timer = setTimeout(() => closeRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);

  return (
    <div aria-live="polite" role="status" style={{ position: "sticky", top: 8, zIndex: 50 }}>
      <button
        type="button"
        onClick={onClose}
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
    </div>
  );
}
