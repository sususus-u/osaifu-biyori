"use client";

// 画面の下(下のメニューのすぐ上)に出す、短い知らせ(依頼229。3つのサービスで出す場所をそろえる)。
// 見た目は、たべびよりの「元に戻す」の帯とそろえる: 白い地、1px の線、角の丸み(--radius-card)、影、文字 14px・行の高さ 1.6。
// 色は、このサービスの色(--brand)。タップで閉じる。durationMs があれば、その時間で消える(無ければ、閉じるまで出す)。
// 隠れない工夫:
//   - 下のメニュー(.tabbar、高さ 78px)の上に出す。一覧の「○件を選択中」のバーが出ているときは、lift でその上に出す。
//   - 出ている間は、知らせの高さの分を --bottom-toast-space に入れ、.scroll の下の余白に足す
//     (いちばん下の行まで、知らせより上にスクロールできる)。
import { useEffect, useLayoutEffect, useRef } from "react";

export const TABBAR_HEIGHT = 78;
export const TOAST_GAP = 8;
// 一覧の選択モードの下のバー(AccountList。高さ 44px のボタン + 上下 10px + 線 1px)の分
export const SELECT_BAR_LIFT = 65;

export default function BottomToast({
  message,
  durationMs,
  lift = 0,
  onClose,
}: {
  message: string;
  durationMs?: number;
  lift?: number;
  onClose: () => void;
}) {
  // 親が再描画しても、表示時間が延びないよう、閉じる関数は ref で持つ
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (durationMs === undefined) return;
    const timer = setTimeout(() => closeRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);

  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const height = boxRef.current?.offsetHeight ?? 0;
    root.style.setProperty("--bottom-toast-space", `${height + TOAST_GAP + lift}px`);
    return () => {
      root.style.removeProperty("--bottom-toast-space");
    };
  }, [message, lift]);

  return (
    <div
      ref={boxRef}
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: TABBAR_HEIGHT + TOAST_GAP + lift,
        width: "min(calc(100% - 24px), 456px)",
        zIndex: 40,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={`${message}(タップで閉じる)`}
        style={{
          display: "block",
          width: "100%",
          padding: "12px 14px",
          textAlign: "left",
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--brand)",
          background: "#fff",
          border: "1px solid var(--brand)",
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
