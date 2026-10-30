"use client";

// 共通の「くわしく見る」(依頼317 仕事2。ホームの形と同じ: ハブ BRAND.md 5章「文字を減らす決まりと「くわしく見る」」)。
// 補足の説明だけを入れる。間違いを防ぐ注意、確認の画面の説明、「元に戻せません」などの決まった文、
// ログインの案内、AI の読み取りの失敗・上限の文は、ここに入れない(閉じてはいけないもの)。
// - 上に細い区切りの線。左に「くわしく見る」(14px、太さ500)、右に開け閉めの印(閉じているときは半角の「+」、開いているときは「−」U+2212)
// - 行全体が1つのボタン(高さ44px以上)。aria-expanded と aria-controls を付ける。はじめは閉じている

import { useId, useState, type CSSProperties, type ReactNode } from "react";

export const MORE_DETAILS_LABEL = "くわしく見る";

// 開け閉めの印の大きさは、一覧の月の見出しと同じ(components/AccountList.tsx の TOGGLE_MARK_STYLE。依頼306)
const MARK_STYLE = {
  color: "var(--text-muted)",
  fontSize: 24,
  fontWeight: 400,
  lineHeight: 1,
  flexShrink: 0,
} as const;

export default function MoreDetails({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div style={{ borderTop: "1px solid #eee", marginTop: 8, ...style }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          minHeight: 44,
          padding: 0,
          border: "none",
          background: "none",
          color: "#333",
          fontSize: 14,
          fontWeight: 500,
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {MORE_DETAILS_LABEL}
        <span aria-hidden="true" style={MARK_STYLE}>
          {open ? "−" : "+"}
        </span>
      </button>
      <div id={id} hidden={!open} style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, paddingBottom: 4 }}>
        {children}
      </div>
    </div>
  );
}
