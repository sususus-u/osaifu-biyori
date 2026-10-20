"use client";

// 一覧で、保存した項目の行の直下に出す案内の枠。濃い背景(ブランド色)に白い文字。タップで閉じる。
// 読み上げ(aria-live)は、枠の外に常設した領域で行う(AccountList)。この枠自体は読み上げの領域ではない。

export default function StampRowNotice({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`${text}(タップで閉じる)`}
      style={{
        display: "block",
        width: "100%",
        padding: "12px 14px",
        textAlign: "left",
        fontSize: 15,
        lineHeight: 1.6,
        fontWeight: 500,
        color: "#fff",
        background: "var(--brand)",
        border: "none",
        borderTop: "0.5px solid #f0f0f0",
      }}
    >
      {text}
    </button>
  );
}
