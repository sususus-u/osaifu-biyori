"use client";

// メニュー「設定」→「アカウント」の、ただ1つの行「おきづきびよりのアカウント」(依頼366 仕事1・2)。
// 呼び名・プラン・ログアウトは、この行からホーム(HUB_ACCOUNT_URL)へ。このアプリには、呼び名の入力の欄・保存を置かない。
// - 行の下に小さく、今の呼び名(読むだけ)と、呼び名はホームで変えられること(HUB_NAME_LINK_TEXT)を添える
// - 自分の呼び名: users/{uid}.username(ホームが保存する)。無ければ、古い users/{uid}.displayName(lib/ownName.ts)
// - Firestore の users/{uid} を直接読む(前の中継 app/api/user-name は、依頼371 で消した)

import { useEffect, useState } from "react";
import { ExternalLink, User } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { HUB_ACCOUNT_MENU_LABEL, HUB_ACCOUNT_URL, HUB_NAME_LINK_TEXT } from "@/lib/login-handoff";
import { ownNameText } from "@/lib/ownName";

const CAPTION = { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, overflowWrap: "anywhere" } as const;

export default function AccountSettings() {
  const { uid } = useAuth();
  // 読み終わるまでは null(呼び名の行を出さない)
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, "users", uid))
      .then((snap) => {
        if (!cancelled) setName(ownNameText(snap.exists() ? snap.data() : null));
      })
      .catch(() => {
        // 読めなかったときは、呼び名の行を出さない
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <a
      href={HUB_ACCOUNT_URL}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 44,
        padding: "14px",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <User size={18} color="var(--brand)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{HUB_ACCOUNT_MENU_LABEL}</span>
        {name !== null && <span style={{ ...CAPTION, display: "block", marginTop: 2 }}>呼び名:{name}</span>}
        <span style={{ ...CAPTION, display: "block" }}>{HUB_NAME_LINK_TEXT}</span>
      </span>
      <ExternalLink size={16} color="#ccc" style={{ flexShrink: 0 }} />
    </a>
  );
}
