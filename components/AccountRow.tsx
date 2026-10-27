"use client";

// 一覧の1行。「期間限定」「期限なし」「サービス別」の各タブの行を、この部品で描く。
// 行ごとの違いは props で受ける(右側の金額の出し方、期限切れ表示の有無)。
// data-account-id は、この行に案内などを後から結びつけるための印(見た目には影響しない)。

import Link from "next/link";
import { Timestamp } from "firebase/firestore";
import type { AccountDoc } from "@/types/firestore";
import { displayAccountName } from "@/lib/stampMerge";
import { getYenValue } from "@/lib/accountUtils";
import { CheckMark } from "@/components/SelectCheck";

export interface AccountWithId extends AccountDoc {
  id: string;
}

function formatBalance(balance?: number | null, unit?: string | null) {
  if (balance === undefined || balance === null) return "";
  if (unit === "円") {
    return (
      <>
        {balance.toLocaleString()}
        <span style={{ fontSize: 12 }}>円</span>
      </>
    );
  }
  return `${balance.toLocaleString()}${unit ?? ""}`;
}

function balanceDisplay(acc: AccountWithId) {
  if (
    acc.faceValue !== undefined &&
    acc.faceValue !== null &&
    acc.itemQuantity !== undefined &&
    acc.itemQuantity !== null
  ) {
    return (
      <>
        {acc.faceValue.toLocaleString()}円 × {acc.itemQuantity}枚 = {formatBalance(acc.currentBalance, acc.balanceUnit)}
      </>
    );
  }
  if (acc.category === "points") {
    const yenValue = getYenValue(acc);
    if (yenValue !== null) {
      const isEquivalentRate = acc.yenExchangeRate == null || acc.yenExchangeRate === 1;
      if (isEquivalentRate) {
        return (
          <>
            {yenValue.toLocaleString()}
            <span style={{ fontSize: 12 }}>円相当</span>
          </>
        );
      }
      return (
        <>
          {formatBalance(acc.currentBalance, acc.balanceUnit)}（{yenValue.toLocaleString()}
          <span style={{ fontSize: 12 }}>円相当</span>）
        </>
      );
    }
  }
  return formatBalance(acc.currentBalance, acc.balanceUnit);
}

function isOverdueUnupdated(acc: AccountWithId) {
  if (!acc.expiryDate || acc.type !== "continuous") return false;
  const expiry = (acc.expiryDate as Timestamp).toDate();
  return expiry.getTime() < Date.now();
}

interface AccountRowProps {
  account: AccountWithId;
  // 名前の下の小さな文字(種類、期限など。タブごとに違う)
  subText: string;
  // true のとき、期限が過ぎた継続型の行を薄いオレンジで塗る(「期限未設定」と「期限なし」の行は false)
  highlightOverdue?: boolean;
  // 保存した直後の行の印(左の端に、サービスの色の線。依頼231。期限が過ぎた行のクリーム色の塗りと見分けるため、塗らない)。
  // 保存の知らせは、画面の下の知らせ(BottomToast)で出す(依頼229)
  highlighted?: boolean;
  // 選択モード: 行全体が「チェックの切り替え」になり、編集画面へは移らない(通常のときは <Link> のまま)
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export default function AccountRow({
  account,
  subText,
  highlightOverdue = false,
  highlighted = false,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: AccountRowProps) {
  if (selectMode) {
    return (
      <>
        <div
          role="checkbox"
          aria-checked={selected}
          aria-label={displayAccountName(account.name)}
          tabIndex={0}
          data-account-id={account.id}
          onClick={onToggleSelect}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              onToggleSelect?.();
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 44,
            padding: "12px 14px",
            fontSize: 14,
            borderTop: "0.5px solid #f0f0f0",
            cursor: "pointer",
            ...(selected ? { background: "#efd5cc" } : {}),
          }}
        >
          <CheckMark state={selected ? "all" : "none"} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 500 }}>{displayAccountName(account.name)}</p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{subText}</p>
          </div>
          <p style={{ margin: 0 }}>{balanceDisplay(account)}</p>
        </div>
          </>
    );
  }
  return (
    <>
    <Link
      href={`/accounts/${account.id}/edit`}
      data-account-id={account.id}
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "12px 14px",
        fontSize: 14,
        borderTop: "0.5px solid #f0f0f0",
        textDecoration: "none",
        color: "inherit",
        ...(highlightOverdue ? { background: isOverdueUnupdated(account) ? "#fdf3e7" : "transparent" } : {}),
        ...(highlighted ? { boxShadow: "inset 4px 0 0 var(--brand)" } : {}),
      }}
    >
      <div>
        <p style={{ margin: 0, fontWeight: 500 }}>{displayAccountName(account.name)}</p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{subText}</p>
      </div>
      <p style={{ margin: 0 }}>{balanceDisplay(account)}</p>
    </Link>
    </>
  );
}
