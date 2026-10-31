"use client";

// メニュー画面「設定」→「アカウント」の表示名。
// 表示名は、共有機能(まだ未実装)が将来追加された時に使う土台として、
// 先に用意しておくもの。現時点では実際には使われない。
//
// まもりびよりの招待承認画面と同じ考え方:
// - このアプリのFirestore(users/{uid}.displayName)に、すでに値があればそれを使う
// - 無ければ、ハブに登録されているユーザー名を初期値の候補として表示する
//   (この時点ではまだ保存しない。保存するのは、利用者が「保存」を押した時だけ)
//
// 見せる段階を分ける(依頼317 仕事2。ホームのメニューの「ユーザー名」と同じ形):
// - 保存してあるとき(1段目): 表示名と「変更する」だけ。説明・入力の欄・「保存」「キャンセル」は、開いたとき(2段目)だけ
// - まだ保存していないとき: はじめから入力の欄を出す
// - 保存したら1段目に戻し、「保存しました」を画面の下に出す

import { useEffect, useState } from "react";
import BottomToast from "@/components/BottomToast";
import { STAMP_TOAST_MS } from "@/lib/stampToast";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/authFetch";

const OUTLINE_BUTTON = {
  flexShrink: 0,
  minHeight: 44,
  background: "#fff",
  color: "var(--brand)",
  border: "1px solid var(--brand)",
  borderRadius: 100,
  padding: "0 16px",
  fontSize: 13,
  fontWeight: 500,
} as const;

export default function AccountSettings() {
  const { uid } = useAuth();
  const [displayName, setDisplayName] = useState("");
  // 保存してある表示名(このアプリの Firestore)。空なら、まだ保存していない
  const [savedName, setSavedName] = useState("");
  // 2段目(説明・入力の欄・「保存」「キャンセル」)を開いているか
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 保存した知らせは、画面の下に数秒出す(依頼229)。失敗の文は、欄の下(message)のまま
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, "users", uid));
      const existing = snap.exists()
        ? (snap.data().displayName as string | undefined)
        : undefined;
      if (cancelled) return;
      if (existing) {
        setDisplayName(existing);
        setSavedName(existing);
        setLoaded(true);
        return;
      }
      try {
        const res = await authFetch("/api/user-name");
        const data = await res.json();
        if (!cancelled && data.name) setDisplayName(data.name);
      } catch {
        // 取得に失敗しても、空欄のままにする
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function handleSave() {
    if (!uid || saving) return;
    const trimmed = displayName.trim();
    setSaving(true);
    setMessage(null);
    try {
      await setDoc(doc(db, "users", uid), { displayName: trimmed }, { merge: true });
      setDisplayName(trimmed);
      setSavedName(trimmed);
      setEditing(false);
      setDoneMessage("保存しました");
    } catch {
      setMessage("保存に失敗しました。時間をおいてもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDisplayName(savedName);
    setMessage(null);
    setEditing(false);
  }

  // 保存してあり、開いていないときは1段目(表示名と「変更する」だけ)
  const showForm = editing || savedName === "";

  return (
    <div>
      {!showForm ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <p style={{ flex: 1, minWidth: 0, fontSize: 14, overflowWrap: "anywhere" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>表示名:</span>
            {savedName}
          </p>
          <button type="button" onClick={() => setEditing(true)} style={OUTLINE_BUTTON}>
            変更する
          </button>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 10 }}>
            表示名は、共有機能などで、あなたを示す名前です（今は使っていません）。
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 10 }}>
            {/* 4つ共通の案内(ハブ BRAND.md 22章「表示名は本名でなくてよい」。依頼306)。本名を禁止はしない。名前を入れるときは、いつも出す */}
            個人の情報を少なくするため、本名ではなく、ニックネームや家族の中での呼び名がおすすめです。
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例:すずちゃん、パパ"
              aria-label="表示名"
              disabled={!uid || !loaded}
              style={{
                flex: 1,
                minWidth: 0,
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!uid || saving}
              style={{ ...OUTLINE_BUTTON, opacity: !uid || saving ? 0.5 : 1 }}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
          {savedName !== "" && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              style={{ ...OUTLINE_BUTTON, marginTop: 8, color: "#333", border: "1px solid var(--list-frame-border)" }}
            >
              キャンセル
            </button>
          )}
        </>
      )}
      {message && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{message}</p>}
      {doneMessage && (
        <BottomToast message={doneMessage} durationMs={STAMP_TOAST_MS} onClose={() => setDoneMessage(null)} />
      )}
    </div>
  );
}
