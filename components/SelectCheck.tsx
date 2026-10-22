"use client";

// 選択モードのチェックの見た目。押せる範囲は 44px 四方。state: none / some(一部)/ all
// 行のチェックは AccountRow の中で(行全体が押せる)、グループ見出しのチェックはこの部品を button として使う。

export type CheckState = "none" | "some" | "all";

export function CheckMark({ state }: { state: CheckState }) {
  const on = state !== "none";
  return (
    <span
      aria-hidden="true"
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        border: on ? "none" : "1.5px solid #bbb",
        background: on ? "var(--brand)" : "#fff",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 15,
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {state === "all" ? "✓" : state === "some" ? "−" : ""}
    </span>
  );
}

// グループ見出しのチェック(button)。Space / Enter は button の標準の動き
export function GroupCheck({ state, label, onClick }: { state: CheckState; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      aria-label={label}
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        margin: "-10px 0 -10px -14px",
        background: "none",
        border: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <CheckMark state={state} />
    </button>
  );
}
