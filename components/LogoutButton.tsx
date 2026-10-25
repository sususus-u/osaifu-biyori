"use client";

// メニュー「アカウント」欄のログアウトボタン。
// 押すと確認の画面を出し、「ログアウトする」でFirebaseからサインアウトして、
// この端末に残っているユーザー固有のデータ(このアプリのキー)を消す。
// サインアウトできると uid が null になり、画面側(AppShell)が案内の画面を出す。
// プッシュ通知のブラウザ側の登録は、ここでは触らない。

import ConfirmSheet from "@/components/ConfirmSheet";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { clearUserLocalData } from "@/lib/clearUserData";

export default function LogoutButton() {
  const { uid } = useAuth();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!uid) return null;

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signOut(auth);
      clearUserLocalData();
      // メニューは未ログインでも見られるため、トップへ移って案内の画面を出す
      router.replace("/");
    } catch {
      setError("ログアウトできませんでした。もう一度お試しください");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        disabled={busy}
        style={{
          background: "#fff",
          color: "#c0392b",
          border: "1px solid #c0392b",
          borderRadius: 100,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 500,
          opacity: busy ? 0.5 : 1,
        }}
      >
        ログアウト
      </button>
      {error && (
        <p role="alert" style={{ fontSize: 12, color: "#c0392b", marginTop: 6 }}>
          {error}
        </p>
      )}

      {confirming && (
        <ConfirmSheet
          title="ログアウトしますか?"
          description="この端末に残っている、おさいふびよりのデータも消えます。"
          confirmLabel="ログアウトする"
          busyLabel="処理中…"
          variant="normal"
          busy={busy}
          onConfirm={handleLogout}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
