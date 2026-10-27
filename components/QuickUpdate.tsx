"use client";

// クイック更新画面。
// スクショが使えないサービス向けに、残高・期限の2項目だけを最小タップ数で更新できるようにする。
// 対象は継続型(電子マネー・ポイント・マイル等)の口座のみ。完結型は使いきり/失効の実績に関わるため対象外。

import { useEffect, useState } from "react";
import BottomToast from "@/components/BottomToast";
import { STAMP_TOAST_MS } from "@/lib/stampToast";
import { captureBefore, runSavedUndo } from "@/lib/undoRestoreFirestore";
import { undoDoneMessage, type SavedUndo } from "@/lib/undoRestore";
import { UNDO_FAILED_MESSAGE } from "@/lib/savedNotice";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { displayAccountName } from "@/lib/stampMerge";
import { useAuth } from "@/contexts/AuthProvider";
import { LOADING_TEXT, listCountText } from "@/lib/listCount";
import type { AccountDoc } from "@/types/firestore";

interface AccountWithId extends AccountDoc {
  id: string;
}

interface EditingRow {
  account: AccountWithId;
  balance: string;
  expiryDate: string;
}

// サービス名は読み取れなかったが数値だけ読み取れた場合に、ScanUpload側から引き継がれる情報
interface PendingScan {
  balance: number | null;
  balanceUnit: string | null;
  expiryDate: string | null;
}

function toDateInputValue(timestamp?: Timestamp | null): string {
  if (!timestamp) return "";
  const d = timestamp.toDate();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function QuickUpdate() {
  const { uid, isLoading } = useAuth();
  const [accounts, setAccounts] = useState<AccountWithId[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [editingRows, setEditingRows] = useState<EditingRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  // 「元に戻す」(依頼232)。直す前の値に戻す
  const [undo, setUndo] = useState<SavedUndo | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoFailed, setUndoFailed] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  // 最初の読み込みが済んだか(済むまでは「読み込み中…」。ゼロ件の枠を先に出さない。依頼268)
  const [loaded, setLoaded] = useState(false);

  // スクショでサービス名が読み取れなかった場合、ScanUpload側から引き継がれた数値がないか確認する
  useEffect(() => {
    const raw = sessionStorage.getItem("quick-update-pending-scan");
    if (!raw) return;
    try {
      setPendingScan(JSON.parse(raw) as PendingScan);
    } catch (error) {
      console.error(error);
      sessionStorage.removeItem("quick-update-pending-scan");
    }
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "accounts"),
      where("ownerId", "==", uid),
      where("type", "==", "continuous")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: AccountWithId[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as AccountDoc),
      }));
      list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      setAccounts(list);
      setLoaded(true);
    });
    return () => unsubscribe();
  }, [uid]);

  // グループ名(未設定なら口座名)でまとめる。例:「楽天ポイント」に通常/期間限定の2口座
  const groups = new Map<string, AccountWithId[]>();
  for (const acc of accounts) {
    const key = displayAccountName(acc.groupName?.trim() || acc.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(acc);
  }
  const groupKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, "ja"));

  function selectGroup(key: string) {
    const items = groups.get(key)!;
    setSelectedGroupKey(key);
    setSavedMessage("");
    setSaveError("");
    setEditingRows(
      items.map((acc, index) => {
        const balance =
          acc.currentBalance === undefined || acc.currentBalance === null
            ? ""
            : String(acc.currentBalance);
        const expiryDate = toDateInputValue(acc.expiryDate as Timestamp | undefined);
        // スクショ由来の読み取り結果があれば、どのサービスか分からないため先頭行にのみ反映する
        if (pendingScan && index === 0) {
          return {
            account: acc,
            balance: pendingScan.balance !== null ? String(pendingScan.balance) : balance,
            expiryDate: pendingScan.expiryDate ?? expiryDate,
          };
        }
        return { account: acc, balance, expiryDate };
      })
    );
    if (pendingScan) {
      sessionStorage.removeItem("quick-update-pending-scan");
      setPendingScan(null);
    }
  }

  function updateRow(index: number, field: "balance" | "expiryDate", value: string) {
    setEditingRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async function handleSaveAll() {
    setIsSaving(true);
    try {
      const restores = await Promise.all(
        editingRows.map(async (row) => {
          const fields = {
            currentBalance: row.balance === "" ? null : Number(row.balance),
            expiryDate: row.expiryDate ? Timestamp.fromDate(new Date(row.expiryDate)) : null,
            lastUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          const before = await captureBefore(row.account.id, Object.keys(fields));
          await updateDoc(doc(db, "accounts", row.account.id), fields);
          return { id: row.account.id, before, updateIds: [] };
        })
      );
      setUndo({ createIds: [], restores });
      setUndoFailed(false);
      setSavedMessage(`「${selectedGroupKey}」を更新しました`);
      setSelectedGroupKey(null);
      setEditingRows([]);
    } catch (error) {
      console.error(error);
      setSaveError("更新に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUndo() {
    if (!undo || undoBusy) return;
    setUndoBusy(true);
    try {
      await runSavedUndo(undo);
      setUndo(null);
      setUndoFailed(false);
      setSavedMessage(undoDoneMessage(undo));
    } catch (error) {
      console.error(error);
      setUndoFailed(true);
    } finally {
      setUndoBusy(false);
    }
  }

  function closeSaved() {
    setSavedMessage("");
    setUndo(null);
    setUndoFailed(false);
  }

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">{LOADING_TEXT}</p>;
  }

  // グループ選択画面
  if (!selectedGroupKey) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-semibold">クイック更新</h1>
          <Link href="/" className="text-sm text-gray-500">
            一覧へ戻る
          </Link>
        </div>
        {pendingScan && (
          <p className="text-sm text-blue-700 bg-blue-50 rounded-md px-3 py-2">
            スクショの読み取り結果:{pendingScan.balance}
            {pendingScan.balanceUnit ?? ""}
            {pendingScan.expiryDate ? `、期限${pendingScan.expiryDate}` : ""}
            。該当するポイント・残高を選んでください
          </p>
        )}

        <p className="text-sm text-gray-500">更新するポイント・残高を選んでください</p>
        <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
          <Lightbulb size={12} className="shrink-0" />
          スマホの画面分割機能を使うと、サービスのアプリと見比べながら入力できて便利です
        </p>

        {savedMessage && (
          <BottomToast
            message={undoFailed ? UNDO_FAILED_MESSAGE : savedMessage}
            done={!undoFailed}
            durationMs={STAMP_TOAST_MS}
            onClose={closeSaved}
            onUndo={undo ? handleUndo : undefined}
            undoBusy={undoBusy}
          />
        )}

        {/* 一覧の見せ方の決まり(依頼268。ハブの BRAND.md 5章): 白い枠(角16px、細い線)の中に行。
            枠のすぐ下の真ん中に「全○件」(1行=1つのまとまり。「○件まとめて」の行も1件と数える)。
            ゼロ件は点線の枠に「まだ○○が登録されていません。」と、登録のボタン(半角の「+」)。「全0件」は出さない */}
        {!loaded ? (
          <p className="text-sm text-gray-500">{LOADING_TEXT}</p>
        ) : groupKeys.length === 0 ? (
          <div className="list-empty">
            <p>まだ継続型のポイント・残高が登録されていません。</p>
            <Link href="/accounts/new" className="btn-primary list-empty-btn">
              + ポイント・残高を登録する
            </Link>
          </div>
        ) : (
          <div>
            <ul className="card" style={{ padding: 0, overflow: "hidden", margin: 0, listStyle: "none" }}>
              {groupKeys.map((key, index) => {
                const items = groups.get(key)!;
                return (
                  <li key={key} style={index === 0 ? undefined : { borderTop: "0.5px solid #f0f0f0" }}>
                    <button
                      onClick={() => selectGroup(key)}
                      className="w-full text-left text-base flex justify-between items-center"
                      style={{ padding: "12px 14px", minHeight: 48, background: "none", border: "none" }}
                    >
                      <span>{key}</span>
                      {items.length > 1 && (
                        <span className="text-xs text-[var(--text-muted)]">{items.length}件まとめて</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="list-count">{listCountText(groupKeys.length)}</p>
          </div>
        )}
      </div>
    );
  }

  // 入力画面(残高・期限のみ。グループ内の口座数だけ行が並ぶ)
  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">{selectedGroupKey}</h1>
        <button onClick={() => setSelectedGroupKey(null)} className="text-sm text-gray-500">
          戻る
        </button>
      </div>

      {editingRows.map((row, index) => (
        <div key={row.account.id} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
          {editingRows.length > 1 && (
            <p className="text-sm font-medium text-gray-700">{displayAccountName(row.account.name)}</p>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">残高</label>
            <input
              type="number"
              inputMode="numeric"
              value={row.balance}
              onChange={(e) => updateRow(index, "balance", e.target.value)}
              autoFocus={index === 0}
              className="w-full border rounded-md px-4 py-4 text-2xl text-center"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">有効期限</label>
            <input
              type="date"
              value={row.expiryDate}
              onChange={(e) => updateRow(index, "expiryDate", e.target.value)}
              className="w-full border rounded-md px-4 py-3 text-lg"
            />
          </div>
        </div>
      ))}

      {saveError && <p className="text-sm text-red-700">{saveError}</p>}
      <button
        onClick={handleSaveAll}
        disabled={isSaving}
        className="btn-primary form-btn"
      >
        {isSaving ? "更新中…" : "更新する"}
      </button>
    </div>
  );
}
