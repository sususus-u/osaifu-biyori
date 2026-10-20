"use client";

// 確認のポップアップ(削除・ログアウトなど)の共通部品。4つのアプリで同じ仕様にそろえる。
// 使うときは、出す場面だけ描画する: {open && <ConfirmSheet ... />}
// スマホは下から出るシート、広い画面は中央のカード(切り替えは globals.css の .confirm-*)。
// 背景を押す・Esc で閉じる(処理中は閉じない)。開いたら「キャンセル」にフォーカスし、
// Tab はポップアップの中だけを回る。閉じたら、押す前のボタンにフォーカスを戻す。

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

interface ConfirmSheetProps {
  title: string;
  description?: ReactNode;
  confirmLabel: string; // 例:「削除する」
  busyLabel?: string; // 処理中の実行ボタンの文言。省略すると confirmLabel のまま
  variant?: "danger" | "normal"; // 元に戻せない操作は danger(赤)
  busy?: boolean; // 処理中は、両方のボタンを押せず、閉じない
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmSheet({
  title,
  description,
  confirmLabel,
  busyLabel,
  variant = "normal",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  const titleId = useId();
  const descId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = sheetRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (!items || items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="confirm-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={sheetRef}
        className="confirm-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="confirm-title">{title}</h2>
        {description && <div id={descId} className="confirm-desc">{description}</div>}
        <div className="confirm-actions">
          <button
            type="button"
            className={variant === "danger" ? "confirm-btn confirm-btn-danger" : "confirm-btn confirm-btn-normal"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="confirm-btn confirm-btn-cancel"
            onClick={onClose}
            disabled={busy}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
