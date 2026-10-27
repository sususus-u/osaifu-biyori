"use client";

// 現物(切手・紙の商品券など)を撮影して登録・更新する画面。
// 誤読リスクが高いため、既存口座と一致する場合も、初めての場合も、必ずこの画面内で
// 内容を確認・修正してから、本人の操作(保存ボタン)で保存する。自動保存はしない。

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { prepareScanImage, readScanJson } from "@/lib/scanImage";
import {
  isNothingRead,
  isOverItemLimit,
  unreadableCount,
  breakdownLines,
  breakdownTotals,
  isBreakdownSuspect,
  MSG_BREAKDOWN_SUSPECT,
  type BreakdownLine,
  type ScanRow,
  initialRows,
  rowsTotals,
  addRow,
  removeRow,
  updateRow,
  validateRows,
  MSG_NOTHING_READ,
  MSG_TOO_MANY,
  type PhysicalScanResponse,
} from "@/lib/physicalScanResult";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import {
  isScannedStamp,
  canonicalStampName,
  isStampName,
  saveRowName,
  showTopNameField,
  topNameHint,
  validateStampRows,
  type SaveRow,
} from "@/lib/stampMerge";
import BusyIndicator from "@/components/BusyIndicator";
import ConfirmSheet from "@/components/ConfirmSheet";
import BottomToast from "@/components/BottomToast";
import { replaceChanges, REPLACE_NO_CHANGE, REPLACE_WARNING } from "@/lib/replaceConfirm";
import { scanStampSummary } from "@/lib/stampAuto";
import { STAMP_NAME_BG } from "@/lib/stampNameView";
import { busyViewForPhysical, waitForPaint } from "@/lib/busyView";
import { saveStamps } from "@/lib/stampSave";
import { guardNewRecords } from "@/lib/recordLimitClient";
import { RecordLimitError } from "@/lib/hubRecordCheck";
import { stashStampSavedMessage } from "@/lib/stampToast";
import { captureBefore } from "@/lib/undoRestoreFirestore";
import { makeUndoCapture, type SavedUndo } from "@/lib/undoRestore";
import { stampAddKeys } from "@/lib/stampSaveFirestore";
import { firestoreStampDeps } from "@/lib/stampSaveFirestore";

// Firestore の期限(Timestamp)を YYYY-MM-DD にする。なければ null
function timestampToDateString(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  if (!t || typeof t.toDate !== "function") return null;
  const d = t.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ScanPhysicalUpload() {
  const router = useRouter();
  const { uid } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // 撮った写真を縮めている間(読み取りの前)。待たされていることを利用者に伝える
  const [isPreparing, setIsPreparing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 確認フォームの状態
  const [matchedAccountId, setMatchedAccountId] = useState<string | null>(null);
  const [existingBalance, setExistingBalance] = useState<number | null>(null);
  const [existingFaceValue, setExistingFaceValue] = useState<number | null>(null);
  const [existingExpiry, setExistingExpiry] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [existingQuantity, setExistingQuantity] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  // 額面ごとの行(額面、枚数)。合計金額は、手で直していない間は、行から自動で計算する
  const [rows, setRows] = useState<ScanRow[]>([{ faceValue: "", count: "" }]);
  const [totalEdited, setTotalEdited] = useState(false);
  // 額面が1種類のときの保存(今までの「額面×枚数」の1件)に使う、1行目の額面と枚数
  const unitAmount = rows.length === 1 ? rows[0].faceValue : "";
  const quantity = rows.length === 1 ? rows[0].count : "";
  // 読み取り結果が切手(AI の名前が「切手」)のまま、名前を変えていないとき true。手で名前を変えたら false
  const [scanIsStamp, setScanIsStamp] = useState(false);
  // 額面ごとの項目で保存する(足す/作る)のは、複数の額面、読み取り結果が切手、または名前が「切手 N円」の形のとき。
  // 額面が1種類の切手以外(商品券など)、または手で名前を「切手」などに変えたときは、今までどおり1件(置き換える/追加する)
  const busy = busyViewForPhysical(isPreparing, isProcessing);
  const stampMode = rows.length > 1 || scanIsStamp || isStampName(name);
  const rowName = (r: ScanRow) =>
    saveRowName({ rowCount: rows.length, name, scanIsStamp, rowName: r.name, faceValue: r.faceValue });
  const [expiryDate, setExpiryDate] = useState("");
  // 期限を手で直したか(自動で設定した一言から、期限と通知を外す)
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [nameUnrecognized, setNameUnrecognized] = useState(false);
  // 枚数が目安(MAX_ITEMS_PER_SCAN)を超えたときの警告。登録は止めない
  const [overLimit, setOverLimit] = useState(false);
  // 額面が読めなかった枚数(枚数と合計には含まれていない)
  const [unreadable, setUnreadable] = useState(0);
  // 確認用の内訳(額面×枚数)。手で直せる入力欄とは別で、読み取り結果をそのまま見せる
  const [lines, setLines] = useState<BreakdownLine[]>([]);
  const [linesTotal, setLinesTotal] = useState({ amount: 0, count: 0 });
  const [suspect, setSuspect] = useState(false);

  // スクショ登録フォームからカメラを直接起動した場合、撮影した画像がsessionStorage経由で
  // 渡ってくる。マウント時に一度だけ確認し、あれば自動で読み取り処理を始める。
  useEffect(() => {
    const raw = sessionStorage.getItem("physical-scan-pending-image");
    if (!raw) return;
    sessionStorage.removeItem("physical-scan-pending-image");

    try {
      const { base64, mediaType } = JSON.parse(raw) as { base64: string; mediaType: string };
      setPreviewUrl(`data:${mediaType};base64,${base64}`);
      processImage(base64, mediaType);
    } catch (error) {
      console.error(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processImage(base64: string, mediaType: string) {
    if (!uid) return;

    setErrorMessage("");
    setSavedMessage("");
    setOverLimit(false);
    setUnreadable(0);
    setLines([]);
    setSuspect(false);
    setIsProcessing(true);
    setMatchedAccountId(null);
    setExistingBalance(null);
    setExistingFaceValue(null);
    setExistingExpiry(null);
    setExistingQuantity(null);

    try {
      // 1日の回数をアカウントごとに数えるため、本人のIDトークンを付けて送る。
      const res = await authFetch("/api/scan-physical-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      // 上限に達した場合などは、サーバーからの案内文をそのまま表示する。413 などは撮り直しの案内
      const data = await readScanJson<PhysicalScanResponse>(res);

      // 何も読めなかったときは、フォームを出さず、撮り直しの案内だけを出す
      if (isNothingRead(data)) {
        setName("");
        setScanIsStamp(false);
        setTotalAmount("");
        setRows([{ faceValue: "", count: "" }]);
        setTotalEdited(false);
        setExpiryDate("");
        setItemCount(null);
        setNameUnrecognized(false);
        setErrorMessage(MSG_NOTHING_READ);
        return;
      }
      setOverLimit(isOverItemLimit(data));
      setUnreadable(unreadableCount(data));
      setLines(breakdownLines(data));
      setLinesTotal(breakdownTotals(data));
      setSuspect(isBreakdownSuspect(data));

      setName(data.name ?? "");
      setScanIsStamp(isScannedStamp(data.name));
      setNameUnrecognized(!data.name);
      // 額面ごとの内訳があれば、それを行の初期値にする。合計は行から計算(内訳がなければ、今までどおり AI の合計)
      const initial = initialRows(data);
      setRows(initial);
      setTotalEdited(false);
      setTotalAmount(
        breakdownLines(data).length > 0
          ? String(rowsTotals(initial).amount)
          : data.totalAmount != null
            ? String(data.totalAmount)
            : ""
      );
      setExpiryDate(data.expiryDate ?? "");
      setExpiryTouched(false);
      setItemCount(data.itemCount);

      // 同じ名前の既存口座があるか確認(あれば比較しながら更新できるようにする)
      if (data.name) {
        const q = query(
          collection(db, "accounts"),
          where("ownerId", "==", uid),
          where("name", "==", data.name)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const existingDoc = snapshot.docs[0];
          const existingData = existingDoc.data();
          setMatchedAccountId(existingDoc.id);
          setExistingBalance(existingData.currentBalance ?? null);
          setExistingFaceValue(existingData.faceValue ?? null);
          setExistingExpiry(timestampToDateString(existingData.expiryDate));
          setExistingQuantity(existingData.itemQuantity ?? null);
        }
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "読み取りに失敗しました。もう一度お試しいただくか、手入力で登録してください。");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;

    setPreviewUrl(URL.createObjectURL(file));
    setErrorMessage("");
    setIsPreparing(true);
    await waitForPaint(); // 表示を先に描画してから、重い縮小を始める
    let prepared: { base64: string; mediaType: string };
    try {
      prepared = await prepareScanImage(file);
    } catch (error) {
      console.error(error);
      setErrorMessage("画像を読み込めませんでした。もう一度、撮り直してください");
      return;
    } finally {
      setIsPreparing(false);
    }
    await processImage(prepared.base64, prepared.mediaType);
  }

  // 行を変えたとき。合計金額を手で直していなければ、行から計算し直す
  function changeRows(next: ScanRow[]) {
    setRows(next);
    if (!totalEdited) setTotalAmount(String(rowsTotals(next).amount));
  }

  // 手で直した合計を捨てて、行から計算し直す
  function handleRecalcTotal() {
    setTotalEdited(false);
    setTotalAmount(String(rowsTotals(rows).amount));
  }

  async function handleSave(mode: "replace" | "add" = "replace") {
    if (!uid || !name.trim()) {
      setErrorMessage("名前を入力してください。");
      return;
    }
    const rowsError = validateRows(rows);
    if (rowsError) {
      setErrorMessage(rowsError);
      return;
    }
    if (stampMode) {
      await handleSaveStamps();
      return;
    }
    if (unitAmount === "" || quantity === "") {
      setErrorMessage("額面と枚数を入力してください。");
      return;
    }
    setIsSaving(true);
    setErrorMessage("");

    try {
      const now = serverTimestamp();
      const newFaceValue = unitAmount === "" ? null : Number(unitAmount);
      const newQuantity = quantity === "" ? null : Number(quantity);
      const newBalance = totalAmount === "" ? null : Number(totalAmount);
      const expiryValue = expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null;

      // 「元に戻す」の中身(依頼232)。足す・置き換えるは直す前の値に戻し、作ったときは消す
      let undo: SavedUndo;
      if (matchedAccountId) {
        const balanceValue =
          mode === "add" ? (existingBalance ?? 0) + (newBalance ?? 0) : newBalance;
        const quantityValue =
          mode === "add" ? (existingQuantity ?? 0) + (newQuantity ?? 0) : newQuantity;

        const fields = {
          currentBalance: balanceValue,
          balanceUnit: "円",
          expiryDate: expiryValue,
          faceValue: newFaceValue,
          itemQuantity: quantityValue,
          lastUpdatedAt: now,
          updatedAt: now,
        };
        const before = await captureBefore(matchedAccountId, Object.keys(fields));
        await updateDoc(doc(db, "accounts", matchedAccountId), fields);
        undo = { createIds: [], restores: [{ id: matchedAccountId, before, updateIds: [] }] };
      } else {
        const blocked = await guardNewRecords(uid, [
          { groupName: canonicalStampName(name.trim()), category: "gift_certificate" },
        ]);
        if (blocked) {
          setErrorMessage(blocked);
          return;
        }
        const created = await addDoc(collection(db, "accounts"), {
          ownerId: uid,
          name: canonicalStampName(name.trim()),
          groupName: canonicalStampName(name.trim()),
          category: "gift_certificate",
          isYenBased: true,
          type: "finite",
          currentBalance: newBalance,
          balanceUnit: "円",
          expiryDate: expiryValue,
          faceValue: newFaceValue,
          itemQuantity: newQuantity,
          storageLocationMemo: null,
          notificationTiming: { firstStageDays: 90, secondStageDays: 21 },
          lastUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        undo = { createIds: [created.id], restores: [] };
      }

      // 新しく作ったら「登録しました」、既存に足した・置き換えたら「更新しました」(依頼252)
      const savedText = `「${name}」を${matchedAccountId ? "更新しました" : "登録しました"}`;
      setSavedMessage(savedText);
      stashStampSavedMessage(window.sessionStorage, { message: savedText, items: [], undo });
      setTimeout(() => router.push("/"), 800);
    } catch (error) {
      console.error(error);
      setErrorMessage(matchedAccountId ? "更新に失敗しました。もう一度お試しください。" : "登録に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  // 額面ごとの項目で保存する。同じ名前・額面があれば足し、なければ作る(全部成功か、全部失敗)
  async function handleSaveStamps() {
    if (!uid) return;
    const saveRows: SaveRow[] = rows.map((r) => ({
      name: canonicalStampName(rowName(r).trim()),
      faceValue: Number(r.faceValue),
      count: Number(r.count),
    }));
    const stampError = validateStampRows(saveRows);
    if (stampError) {
      setErrorMessage(stampError);
      return;
    }
    setIsSaving(true);
    setErrorMessage("");
    try {
      const expiry = expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null;
      const capture = makeUndoCapture();
      const result = await saveStamps(firestoreStampDeps(uid, expiry, capture), saveRows);
      setSavedMessage(result.message);
      // 「元に戻す」(依頼232): 足した項目は足す前の値に戻し、作った項目は消す
      const keys = stampAddKeys(expiry);
      const undo: SavedUndo = {
        createIds: result.items.filter((i) => i.kind === "create").map((i) => i.id),
        restores: result.items.filter((i) => i.kind === "add").map((i) => capture.restoreFor(i.id, keys)),
      };
      // 一覧に移ると、この画面の表示は消えるので、一覧の画面の下の知らせで出す(該当の行には印を付ける)
      stashStampSavedMessage(window.sessionStorage, { message: result.message, items: result.items, undo });
      setTimeout(() => router.push("/"), 300);
    } catch (error) {
      if (error instanceof RecordLimitError) {
        setErrorMessage(error.message);
        return;
      }
      console.error(error);
      setErrorMessage("保存に失敗しました。何も保存されていません。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
        切手や紙の商品券など、現物を並べて撮影してください。枚数・額面をAIが数えて合計金額を算出します。
      </p>
      <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
        読み取り精度が写真の状態に左右されやすいため、保存前に必ず内容を確認してください。
      </p>
      <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
        明るい場所で、正面からピントを合わせて撮ると読み取り精度が上がります。
      </p>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        disabled={isProcessing || isPreparing}
        style={{ width: "100%", fontSize: 14, marginBottom: 16 }}
      />

      {previewUrl && (
        <div className="card" style={{ marginBottom: 16, padding: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="選択した画像のプレビュー"
            style={{ width: "100%", maxHeight: 240, objectFit: "contain" }}
          />
        </div>
      )}

      {busy && <BusyIndicator title={busy.title} note={busy.note} />}
      {showReplaceConfirm && (
        <ConfirmSheet
          title="置き換えますか？"
          description={
            <>
              {(() => {
                const lines = replaceChanges(
                  { balance: existingBalance, expiry: existingExpiry, faceValue: existingFaceValue, quantity: existingQuantity },
                  {
                    balance: totalAmount === "" ? null : Number(totalAmount),
                    expiry: expiryDate === "" ? null : expiryDate,
                    faceValue: unitAmount === "" ? null : Number(unitAmount),
                    quantity: quantity === "" ? null : Number(quantity),
                  },
                  "円"
                );
                return (lines.length > 0 ? lines : [REPLACE_NO_CHANGE]).map((l) => (
                  <span key={l} style={{ display: "block" }}>
                    {l}
                  </span>
                ));
              })()}
              <span style={{ display: "block", marginTop: 8 }}>{REPLACE_WARNING}</span>
            </>
          }
          confirmLabel="置き換える"
          busyLabel="置き換え中…"
          variant="danger"
          busy={isSaving}
          onConfirm={async () => {
            await handleSave("replace");
            setShowReplaceConfirm(false);
          }}
          onClose={() => setShowReplaceConfirm(false)}
        />
      )}
      {errorMessage && <p style={{ fontSize: 13, color: "#b3261e" }}>{errorMessage}</p>}
      {savedMessage && <BottomToast message={savedMessage} onClose={() => setSavedMessage("")} />}

      {!isProcessing && (name || totalAmount) && (
        <div className="card" style={{ marginTop: 8 }}>
          {matchedAccountId && !stampMode && (
            <p style={{ fontSize: 12, color: "var(--brand)", marginBottom: 12 }}>
              登録済みのポイント・残高と同じ名前です。現在の残高:¥{(existingBalance ?? 0).toLocaleString()}
            </p>
          )}
          {overLimit && <p style={{ fontSize: 12, color: "#b3261e", marginBottom: 8 }}>{MSG_TOO_MANY}</p>}
          {unreadable > 0 && (
            <p style={{ fontSize: 12, color: "#b3261e", marginBottom: 8 }}>
              額面が読めなかった切手が{unreadable}枚あります。この枚数と金額には含まれていません。必要なら、枚数と合計を直してください
            </p>
          )}
          {suspect && <p style={{ fontSize: 12, color: "#b3261e", marginBottom: 8 }}>{MSG_BREAKDOWN_SUSPECT}</p>}
          {itemCount !== null && (
            <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>読み取った枚数:{itemCount}枚</p>
          )}
          {lines.length > 0 && (
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>読み取った内訳（確認用）</p>
              {lines.map((l, i) => (
                <p key={i}>
                  {l.faceValue.toLocaleString()}円 × {l.count.toLocaleString()}枚 = {l.subtotal.toLocaleString()}円
                </p>
              ))}
              {unreadable > 0 && <p>読めなかった枚:{unreadable}枚</p>}
              <p style={{ fontWeight: 600, marginTop: 4 }}>
                合計 {linesTotal.count.toLocaleString()}枚 / {linesTotal.amount.toLocaleString()}円
              </p>
            </div>
          )}

          {stampMode && (
            <p
              style={{ margin: "0 0 12px", padding: "8px 12px", borderRadius: 8, background: STAMP_NAME_BG, color: "#444", fontSize: 13, lineHeight: 1.6 }}
            >
              {scanStampSummary({ expiryDate, expiryTouched })}
            </p>
          )}

          {showTopNameField(scanIsStamp) && (
            <div className="field">
              <label>名前</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setScanIsStamp(false);
                }}
                placeholder="例:切手、図書カード"
              />
              <p style={{ fontSize: 12, color: "#999", margin: "4px 0 0" }}>{topNameHint(rows.length)}</p>
              {nameUnrecognized && (
                <p style={{ fontSize: 12, color: "#b3261e" }}>
                  文字を読み取れませんでした。手入力してください
                </p>
              )}
            </div>
          )}

          <div className="field">
            <label>額面 × 枚数</label>
            {rows.map((row, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
              {(rows.length > 1 || scanIsStamp) && (
                <input
                  type="text"
                  value={rowName(row)}
                  onChange={(e) => changeRows(updateRow(rows, i, { name: e.target.value }))}
                  placeholder="名前（例:切手 1円）"
                  maxLength={40}
                  style={{ width: "100%", marginBottom: 4 }}
                />
              )}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  value={row.faceValue}
                  onChange={(e) => changeRows(updateRow(rows, i, { faceValue: e.target.value }))}
                  placeholder="額面（1枚あたり）"
                  aria-label="額面（1枚あたり、円）"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <span style={{ color: "#666", whiteSpace: "nowrap" }}>円</span>
                <span style={{ color: "#999" }}>×</span>
                <input
                  type="number"
                  value={row.count}
                  onChange={(e) => changeRows(updateRow(rows, i, { count: e.target.value }))}
                  placeholder="枚数"
                  aria-label="枚数（枚）"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <span style={{ color: "#666", whiteSpace: "nowrap" }}>枚</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => changeRows(removeRow(rows, i))}
                    aria-label="この行を削除"
                    className="btn-danger btn-danger-small"
                    style={{ flexShrink: 0 }}
                  >
                    削除
                  </button>
                )}
              </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => changeRows(addRow(rows))}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--brand)",
                background: "#fff",
                border: "1px solid var(--brand)",
                borderRadius: "var(--radius-pill)",
                whiteSpace: "nowrap",
              }}
            >
              行を追加
            </button>
            <p style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
              額面ごとに行を分けて入力できます。合計は行から自動で計算します
            </p>
            {stampMode && (
              <p style={{ fontSize: 12, color: "var(--brand)", marginTop: 4 }}>
                額面ごとに別のポイント・残高として登録します。同じ名前・額面のものがあれば、枚数と合計金額を足します
              </p>
            )}
            <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
              切手など重なって見えるものは、枚数を多く数えてしまうことがあります。実際の枚数に修正してください。
            </p>
            {itemCount === 1 && (
              <p style={{ fontSize: 12, color: "var(--brand)", marginTop: 4 }}>
                1枚だけ撮影した場合の初期値です。実際にお持ちの枚数に変更すると合計金額を計算できます
              </p>
            )}
          </div>

          {stampMode ? (
            <div className="field">
              <label>合計金額（円）</label>
              <p style={{ fontSize: 14 }}>
                {rowsTotals(rows).amount.toLocaleString()}円（額面×枚数を、行ごとに足した額）
              </p>
            </div>
          ) : (
          <div className="field">
            <label>合計金額（円）</label>
            <input
              type="number"
              value={totalAmount}
              onChange={(e) => {
                setTotalEdited(true);
                setTotalAmount(e.target.value);
              }}
            />
            <p style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
              行の合計:{rowsTotals(rows).count.toLocaleString()}枚 / {rowsTotals(rows).amount.toLocaleString()}円
              {totalEdited && (
                <button
                  type="button"
                  onClick={handleRecalcTotal}
                  style={{ marginLeft: 8, fontSize: 12, color: "var(--brand)", background: "none", border: "none", textDecoration: "underline" }}
                >
                  行から計算し直す
                </button>
              )}
            </p>
          </div>
          )}

          <div className="field">
            <label>有効期限（任意）</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => {
                setExpiryTouched(true);
                setExpiryDate(e.target.value);
              }}
            />
          </div>

          {matchedAccountId && !stampMode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(true)}
                disabled={isSaving}
                className="btn-primary form-btn"
              >
                {isSaving ? "更新中…" : "置き換える"}
              </button>
              <button
                type="button"
                onClick={() => handleSave("add")}
                disabled={isSaving}
                className="btn-primary form-btn"
              >
                {isSaving ? "更新中…" : "今回の分を追加する"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleSave("replace")}
              disabled={isSaving || isProcessing || isPreparing}
              className="btn-primary form-btn"
            >
              {isSaving ? "登録中…" : stampMode ? "この内容で登録する（同じものがあれば足す）" : "この内容で登録する"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
