"use client";

// 一覧で、保存した項目の行の直下に出す案内の枠。濃い背景(ブランド色)に白い文字。
// 自動では消えない。文をタップするか、右端の「×」で閉じる(一覧のタブを切り替える、画面を離れる、でも消える)。
// 読み上げ(aria-live)は、枠の外に常設した領域で行う(AccountList)。この枠自体は読み上げの領域ではない。

export default function StampRowNotice({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: "var(--brand)",
        borderTop: "0.5px solid #f0f0f0",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={`${text}(タップで閉じる)`}
        style={{
          flex: 1,
          padding: "12px 0 12px 14px",
          textAlign: "left",
          fontSize: 15,
          lineHeight: 1.6,
          fontWeight: 500,
          color: "#fff",
          background: "transparent",
          border: "none",
        }}
      >
        {text}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="案内を閉じる"
        style={{
          flex: "0 0 44px",
          minWidth: 44,
          minHeight: 44,
          fontSize: 22,
          lineHeight: 1,
          color: "#fff",
          background: "transparent",
          border: "none",
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
