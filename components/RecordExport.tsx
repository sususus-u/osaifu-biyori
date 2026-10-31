"use client";

// メニュー「アカウント」の「記録を書き出す(表の形)」(依頼369。依頼341 の決定7)。
// 押すと確かめを出し、「書き出す」で、自分のポイント・残高・残高の履歴・使いきった・失効した記録を
// CSV のファイルにして保存する。無料(プランに関係なく使える)。
// 読むのは、自分の記録だけ(ownerId が自分のもの。ルールでも本人だけが読める)。表は端末の中で作り、サーバーには送らない。

import { useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import ConfirmSheet from "@/components/ConfirmSheet";
import BottomToast from "@/components/BottomToast";
import { STAMP_TOAST_MS } from "@/lib/stampToast";
import {
  EXPORT_CONFIRM_TEXT,
  buildRecordsCsv,
  exportFileName,
  type ExportAccount,
  type ExportOutcome,
  type ExportUpdate,
} from "@/lib/recordExport";
import { CATEGORY_DEFAULTS, type AccountDoc, type AccountUpdateDoc, type OutcomeEventDoc } from "@/types/firestore";

function categoryLabelOf(category: string | undefined, custom?: string): string {
  if (category === "other" && custom) return custom;
  return CATEGORY_DEFAULTS[category as keyof typeof CATEGORY_DEFAULTS]?.label ?? "";
}

export default function RecordExport() {
  const { uid } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  async function handleExport() {
    if (!uid || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const [accountsSnap, outcomesSnap] = await Promise.all([
        getDocs(query(collection(db, "accounts"), where("ownerId", "==", uid))),
        getDocs(query(collection(db, "outcome_events"), where("ownerId", "==", uid))),
      ]);
      const accounts: ExportAccount[] = accountsSnap.docs.map((d) => {
        const a = d.data() as AccountDoc;
        return {
          id: d.id,
          name: a.name,
          categoryLabel: categoryLabelOf(a.category, a.customCategoryLabel),
          groupName: a.groupName,
          currentBalance: a.currentBalance,
          balanceUnit: a.balanceUnit,
          expiryDate: a.expiryDate,
          lastUpdatedAt: a.lastUpdatedAt,
          storageLocationMemo: a.storageLocationMemo,
        };
      });
      const updateLists = await Promise.all(
        accountsSnap.docs.map(async (d) => {
          const snap = await getDocs(collection(db, "accounts", d.id, "updates"));
          return snap.docs.map((u): ExportUpdate => {
            const x = u.data() as AccountUpdateDoc;
            return { accountId: d.id, recordedAt: x.recordedAt, balance: x.balance, expiryDate: x.expiryDate, source: x.source };
          });
        }),
      );
      const outcomes: ExportOutcome[] = outcomesSnap.docs.map((d) => {
        const o = d.data() as OutcomeEventDoc;
        return {
          accountId: o.accountId,
          accountName: o.accountName,
          categoryLabel: categoryLabelOf(o.category),
          eventType: o.eventType,
          eventDate: o.eventDate,
          amount: o.amount,
        };
      });

      const csv = buildRecordsCsv({ accounts, updates: updateLists.flat(), outcomes });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setOpen(false);
      setDoneMessage("書き出しました");
    } catch {
      setOpen(false);
      setMessage("書き出せませんでした。時間をおいてもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!uid}
        style={{
          minHeight: 44,
          background: "#fff",
          color: "var(--brand)",
          border: "1px solid var(--brand)",
          borderRadius: 100,
          padding: "0 16px",
          fontSize: 13,
          fontWeight: 500,
          opacity: uid ? 1 : 0.5,
        }}
      >
        記録を書き出す(表の形)
      </button>
      {message && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{message}</p>}
      {open && (
        <ConfirmSheet
          title="記録を書き出しますか？"
          description={EXPORT_CONFIRM_TEXT}
          confirmLabel="書き出す"
          busyLabel="書き出し中…"
          busy={busy}
          onConfirm={handleExport}
          onClose={() => setOpen(false)}
        />
      )}
      {doneMessage && (
        <BottomToast message={doneMessage} durationMs={STAMP_TOAST_MS} onClose={() => setDoneMessage(null)} />
      )}
    </div>
  );
}
