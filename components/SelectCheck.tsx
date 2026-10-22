"use client";

// 選択モードのチェックの見た目。state: none / some(一部)/ all
// 行のチェックは AccountRow の中で(行全体が押せる)。グループ見出しは、行のチェックと区別するため、
// 「まとめて選ぶ」の文字つきの枠(ボタン)にする。

export type CheckState = "none" | "some" | "all";

export function CheckMark({ state, size = 22 }: { state: CheckState; size?: number }) {
  const on = state !== "none";
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        border: on ? "none" : "1.5px solid #8a7a7a",
        background: on ? "var(--brand)" : "#fff",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.68),
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {state === "all" ? "✓" : state === "some" ? "−" : ""}
    </span>
  );
}

// グループ見出しのボタン。Space / Enter は button の標準の動き。タップの高さは44px
export function GroupCheck({ state, label, onClick }: { state: CheckState; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      aria-label={label}
      onClick={onClick}
      style={{
        minHeight: 44,
        margin: "-10px 0",
        padding: "0 12px 0 8px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--brand)",
        background: state === "none" ? "#fff" : "#f0dcd4",
        border: "1.5px solid var(--brand)",
        borderRadius: 999,
      }}
    >
      <CheckMark state={state} size={20} />
      まとめて選ぶ
    </button>
  );
}
