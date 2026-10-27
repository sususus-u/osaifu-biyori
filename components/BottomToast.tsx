"use client";

// 画面の下(下のメニューのすぐ上)に出す、短い知らせ(依頼229。3つのサービスで出す場所をそろえる)。
// 見た目(依頼231。3つのサービスで同じ形): 地をこのサービスの色(--brand)で塗り、文字は白。済んだ知らせ(done)は左に ✓。
// 角の丸み(--radius-card)、影、文字 14px・行の高さ 1.6。白い文字と --brand(#6e2a32)の見やすさは 10:1 ほど(目安 4.5:1 以上)。
// 閉じ方:
//   - 「元に戻す」が無い知らせは、durationMs(ふつうは STAMP_TOAST_MS、6秒)で消える。タップでも消える。
//   - 「元に戻す」付き(onUndo)は、次の操作(知らせの外を押す、Esc)をするまで出したまま。✕ でも閉じる。
//     「元に戻す」は白い線と白い文字、✕ は白い文字にして、塗った地の上でも見えるようにする。
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
  done = true,
  onClose,
  onUndo,
  undoBusy = false,
}: {
  message: string;
  durationMs?: number;
  lift?: number;
  // 済んだ知らせ(左に ✓)。失敗などの知らせは false
  done?: boolean;
  onClose: () => void;
  // あれば「元に戻す」を出す(次の操作か ✕ で閉じる。durationMs は使わない)
  onUndo?: () => void;
  undoBusy?: boolean;
}) {
  // 親が再描画しても、表示時間が延びないよう、閉じる関数は ref で持つ
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const hasUndo = onUndo !== undefined;
  useEffect(() => {
    if (hasUndo || durationMs === undefined) return;
    const timer = setTimeout(() => closeRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, hasUndo]);

  const boxRef = useRef<HTMLDivElement>(null);
  // 「元に戻す」付きは、次の操作(知らせの外を押す、Esc)で閉じる。出す前の押し下げでは閉じない
  useEffect(() => {
    if (!hasUndo) return;
    const shownAt = performance.now();
    function onClick(e: MouseEvent) {
      if (boxRef.current?.contains(e.target as Node)) return;
      if (e.timeStamp >= shownAt) closeRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [hasUndo, message]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const height = boxRef.current?.offsetHeight ?? 0;
    root.style.setProperty("--bottom-toast-space", `${height + TOAST_GAP + lift}px`);
    return () => {
      root.style.removeProperty("--bottom-toast-space");
    };
  }, [message, lift, hasUndo]);

  const look = {
    fontSize: 14,
    lineHeight: 1.6,
    color: "#fff",
    background: "var(--brand)",
    border: "1px solid var(--brand)",
    borderRadius: "var(--radius-card)",
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)",
  } as const;
  const text = (
    <span style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
      {done && (
        <span aria-hidden="true" style={{ fontWeight: 700, flexShrink: 0 }}>
          ✓
        </span>
      )}
      <span style={{ whiteSpace: "pre-line" }}>{message}</span>
    </span>
  );

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
      {hasUndo ? (
        <div style={{ ...look, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
          {text}
          <button
            type="button"
            onClick={onUndo}
            disabled={undoBusy}
            style={{
              flexShrink: 0,
              minHeight: 36,
              padding: "0 14px",
              borderRadius: 999,
              background: "transparent",
              color: "#fff",
              border: "1.5px solid #fff",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              opacity: undoBusy ? 0.6 : 1,
            }}
          >
            {undoBusy ? "戻しています…" : "元に戻す"}
          </button>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            style={{
              flexShrink: 0,
              minWidth: 44,
              minHeight: 44,
              margin: "-12px -14px -12px -6px",
              padding: 0,
              background: "none",
              color: "#fff",
              border: "none",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onClose}
          aria-label={`${message}（タップで閉じる）`}
          style={{ ...look, display: "flex", width: "100%", padding: "12px 14px", textAlign: "left" }}
        >
          {text}
        </button>
      )}
    </div>
  );
}
