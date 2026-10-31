"use client";

// メニュー画面「設定」→「アカウント」の呼び名(依頼366 仕事1)。
// 呼び名は、おきづきびより(ホーム)の1か所だけで決める。このアプリでは、今の呼び名を見せるだけ(入力の欄・保存は置かない)。
// - 自分の呼び名: users/{uid}.username(ホームが保存する)。無ければ、古い users/{uid}.displayName(lib/ownName.ts)
// - Firestore の users/{uid} を直接読む(この画面が前に呼んでいた中継 app/api/user-name は、もう呼ばない)
// - 変えるときは、ホームの「アカウント」へ(HUB_ACCOUNT_URL)。本名でなくてよい案内も、ホームの入力の欄にだけ出す

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { HUB_ACCOUNT_URL } from "@/lib/login-handoff";
import { ownNameText } from "@/lib/ownName";

/** 呼び名を変える所へのつなぎの文(ホームの「アカウント」へ) */
const NAME_LINK_TEXT = "呼び名は、ホームの「アカウント」で変えられます";

export default function AccountSettings() {
  const { uid } = useAuth();
  // 読み終わるまでは null(名前の欄を出さない)
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, "users", uid))
      .then((snap) => {
        if (!cancelled) setName(ownNameText(snap.exists() ? snap.data() : null));
      })
      .catch(() => {
        // 読めなかったときは、名前の欄を出さない(つなぎの文だけ)
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <div>
      {name !== null && (
        <p style={{ fontSize: 14, overflowWrap: "anywhere", marginBottom: 2 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>呼び名:</span>
          {name}
        </p>
      )}
      <a
        href={HUB_ACCOUNT_URL}
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 44,
          fontSize: 13,
          color: "var(--brand)",
          textDecoration: "underline",
        }}
      >
        {NAME_LINK_TEXT}
      </a>
    </div>
  );
}
