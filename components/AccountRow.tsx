"use client";

// 一覧の1行。「期間限定」「期限なし」「サービス別」の各タブの行を、この部品で描く。
// 行ごとの違いは props で受ける(右側の金額の出し方、期限切れ表示の有無)。
// data-account-id は、この行に案内などを後から結びつけるための印(見た目には影響しない)。

import type { ReactNode } from "react";
import Link from "next/link";
import { Timestamp } from "firebase/firestore";
import type { AccountDoc } from "@/types/firestore";
import { getYenValue } from "@/lib/accountUtils";

export interface AccountWithId extends AccountDoc {
  id: string;
}

function formatBalance(balance?: number | null, unit?: string | null) {
  if (balance === undefined || balance === null) return "";
  if (unit === "円") {
    return (
      <>
        {balance.toLocaleString()}
        <span style={{ fontSize: 11 }}>円</span>
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
            <span style={{ fontSize: 11 }}>円相当</span>
          </>
        );
      }
      return (
        <>
          {formatBalance(acc.currentBalance, acc.balanceUnit)}({yenValue.toLocaleString()}
          <span style={{ fontSize: 11 }}>円相当</span>)
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
  // 行の直下に出す案内の枠。<a> の外(下)に置くので、タップしても編集画面へは飛ばない
  notice?: ReactNode;
}

export default function AccountRow({
  account,
  subText,
  highlightOverdue = false,
  notice,
}: AccountRowProps) {
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
      }}
    >
      <div>
        <p style={{ margin: 0, fontWeight: 500 }}>{account.name}</p>
        <p style={{ margin: 0, fontSize: 12, color: "#999" }}>{subText}</p>
      </div>
      <p style={{ margin: 0 }}>{balanceDisplay(account)}</p>
    </Link>
    {notice}
    </>
  );
}
