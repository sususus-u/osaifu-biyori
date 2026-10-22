"use client";

// 選択モードのチェックの見た目。行のチェックは四角(CheckMark)。
// グループ見出しは、行のチェックと形を変え、文字だけの丸いボタン(GroupCheck)にする。
// 状態は文言(「まとめて選ぶ(1/4)」「まとめて解除」)と色(何も: 白地 / 一部: 薄い色 / 全部: 塗りつぶし)で示す。

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
      {state === "all" ? "✓" : ""}
    </span>
  );
}

// グループ見出しのボタン。タップの高さは44px。aria-pressed: 何も=false / 一部=mixed / 全部=true
export function GroupCheck({
  state,
  text,
  ariaLabel,
  onClick,
}: {
  state: CheckState;
  text: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={state === "all" ? true : state === "some" ? "mixed" : false}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        minHeight: 44,
        margin: "-10px 0",
        padding: "0 14px",
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 600,
        color: state === "all" ? "#fff" : "var(--brand)",
        background: state === "all" ? "var(--brand)" : state === "some" ? "#f0dcd4" : "#fff",
        border: "1.5px solid var(--brand)",
        borderRadius: 999,
      }}
    >
      {text}
    </button>
  );
}
