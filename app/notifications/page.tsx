"use client";

// 「お知らせ」画面。
// - 一番上: ハブ通知のON/OFFを、この場で切り替えられるスイッチ
// - その下: 「あなたへのお知らせ」「運営からのお知らせ」の2タブ
//
// 「あなたへのお知らせ」は、このアプリにまだ個人向けお知らせ機能自体が
// ないため、当面は固定文言のみを表示する。
// 「運営からのお知らせ」は、ハブの GET /api/announcements を
// /api/announcements 経由(サーバー中継)で問い合わせて表示する。
// 利用者は選んだお知らせを、この一覧で非表示にできる(端末にだけ記録し、サーバーは変えない。依頼253で「削除」から「非表示にする」に)。
// 非表示にしたものも含めたすべては「過去のお知らせ」(/notifications/all)で見られる。

import ConfirmSheet from "@/components/ConfirmSheet";
import BottomToast from "@/components/BottomToast";
import { STAMP_TOAST_MS } from "@/lib/stampToast";
import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import { useHasNewAnnouncement } from "@/components/AppShell";
import { ANNOUNCEMENT_EMPTY_TEXT, timeLabel, useAnnouncements } from "@/lib/announcements";
import { listCountText } from "@/lib/listCount";
import { dismissAnnouncements, useDismissedAnnouncementIds } from "@/lib/dismissedAnnouncements";

function PushToggle() {
  const { uid } = useAuth();
  // null は「ハブに問い合わせ中」。確定するまではスイッチを押せないようにする
  // (結果は端末に保存しないので、毎回この状態から始まる)。
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 切り替えた知らせは、画面の下に数秒出す(依頼229)。失敗の文は、スイッチの下(message)のまま
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    authFetch("/api/push-status")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((data) => {
        if (!cancelled) setEnabled(data.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function handleToggle() {
    if (!uid || saving || enabled === null) return;
    const next = !enabled;
    setSaving(true);
    setMessage(null);
    try {
      const res = await authFetch("/api/push-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(
          data.error === "no_subscription"
            ? "この端末では通知が許可されていません。ホームの通知設定をご確認ください。"
            : "切り替えに失敗しました。時間をおいてもう一度お試しください。",
        );
        return;
      }
      setEnabled(next);
      setDoneMessage(next ? "通知をONにしました" : "通知をOFFにしました");
    } catch {
      setMessage("切り替えに失敗しました。時間をおいてもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="push-toggle">
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <div className="label">通知</div>
            <div className="sub">おさいふびよりからのお知らせを受け取る</div>
          </div>
          <button
            type="button"
            className={`switch ${enabled ? "on" : ""}`}
            role="switch"
            aria-checked={enabled === true}
            aria-busy={enabled === null}
            disabled={!uid || saving || enabled === null}
            onClick={handleToggle}
          />
        </div>
      </div>
      {message && <p className="push-toggle-message">{message}</p>}
      {doneMessage && (
        <BottomToast message={doneMessage} durationMs={STAMP_TOAST_MS} onClose={() => setDoneMessage(null)} />
      )}
    </div>
  );
}

function PersonalNotifications() {
  return (
    <div className="list-empty">
      <p>{ANNOUNCEMENT_EMPTY_TEXT}</p>
    </div>
  );
}

function PastAnnouncementsLink() {
  return (
    <Link href="/notifications/all" className="past-announcements-link">
      過去のお知らせ →
    </Link>
  );
}

function HubAnnouncements() {
  const { uid } = useAuth();
  const announcements = useAnnouncements();
  // 利用者が非表示にしたもの。この一覧からは外す(サーバー側は変えない)。
  const dismissedIds = useDismissedAnnouncementIds();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  // 非表示にしたあとの知らせ(画面の下に6秒。元に戻せないので「元に戻す」は付けない)
  const [hiddenMessage, setHiddenMessage] = useState<string | null>(null);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function handleDismiss(count: number) {
    dismissAnnouncements(selectedIds);
    setSelectedIds([]);
    setShowConfirm(false);
    setHiddenMessage(count + "件のお知らせを非表示にしました");
  }

  // このタブを開いた時点で最新のお知らせを見たとみなし、既読相当の日時を記録する
  // (ヘッダーのベルの新着ドット判定に使う。AppShell側でこのドキュメントを
  // onSnapshotで見ているのでリアルタイムに反映される)。
  useEffect(() => {
    if (!uid || !announcements || announcements.length === 0) return;
    setDoc(doc(db, "users", uid), { announcements_seen_at: serverTimestamp() }, { merge: true }).catch(
      () => {},
    );
  }, [uid, announcements]);

  if (announcements === null) {
    return <div className="loading-state">読み込み中…</div>;
  }

  const visible = announcements.filter((a) => !dismissedIds.includes(a.id));

  const hiddenToast = hiddenMessage && (
    <BottomToast message={hiddenMessage} durationMs={STAMP_TOAST_MS} onClose={() => setHiddenMessage(null)} />
  );

  if (visible.length === 0) {
    return (
      <>
        <div className="list-empty">
          <p>
            {announcements.length === 0
              ? ANNOUNCEMENT_EMPTY_TEXT
              : "表示中のお知らせは、ありません。"}
          </p>
        </div>
        {announcements.length > 0 && <PastAnnouncementsLink />}
        {hiddenToast}
      </>
    );
  }

  // 画面に出ていないもの(非表示にした直後など)は数えない。
  const selectedCount = selectedIds.filter((id) => visible.some((a) => a.id === id)).length;

  return (
    <>
      <div className="announcement-toolbar">
        <button
          type="button"
          className="announcement-dismiss-btn"
          disabled={selectedCount === 0}
          onClick={() => setShowConfirm(true)}
        >
          選んだお知らせを非表示にする{selectedCount > 0 ? `（${selectedCount}件）` : ""}
        </button>
      </div>

      {visible.map((a) => (
        <label className="notif-card announcement-card selectable" key={a.id}>
          <input
            type="checkbox"
            className="announcement-check"
            checked={selectedIds.includes(a.id)}
            onChange={() => toggleSelected(a.id)}
            aria-label={`「${a.title}」を選ぶ`}
          />
          <div className="notif-body">
            <div className="notif-title">{a.title}</div>
            <div className="notif-desc">{a.body}</div>
            <div className="notif-time">{timeLabel(a.publishedAt)}</div>
          </div>
        </label>
      ))}

      {/* 最後のお知らせのすぐ下の真ん中に「全○件」(この一覧に出ている件数。依頼270) */}
      <p className="list-count">{listCountText(visible.length)}</p>

      <PastAnnouncementsLink />

      {showConfirm && (
        <ConfirmSheet
          title={"選んだ" + selectedCount + "件のお知らせを非表示にしますか？"}
          description={
            <>
              選んだお知らせは、この一覧に出なくなります。<strong>この一覧に戻すことはできません。</strong>
              「過去のお知らせ」からは、引き続き読むことができます。
            </>
          }
          confirmLabel={selectedCount + "件を非表示にする"}
          // 非表示は削除ではないので、赤ではなくサービスの色(赤は戻せない削除だけ。依頼257)
          variant="normal"
          onConfirm={() => handleDismiss(selectedCount)}
          onClose={() => setShowConfirm(false)}
        />
      )}
      {hiddenToast}
    </>
  );
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<"personal" | "hub">("personal");
  // ベルの新着ドットと同じ判定。「運営からのお知らせ」タブを開くと既読の日時が記録され、消える。
  // 「あなたへのお知らせ」は個人向けお知らせ機能自体がまだないため、点は出さない。
  const hasNewAnnouncement = useHasNewAnnouncement();

  return (
    <div>
      <PushToggle />

      <div className="notif-tabs">
        <button
          type="button"
          className={tab === "personal" ? "active" : ""}
          onClick={() => setTab("personal")}
        >
          あなたへのお知らせ
        </button>
        <button
          type="button"
          className={tab === "hub" ? "active" : ""}
          onClick={() => setTab("hub")}
        >
          運営からのお知らせ
          {hasNewAnnouncement && <span className="badge-dot inline" role="img" aria-label="新着あり" />}
        </button>
      </div>

      {tab === "personal" ? <PersonalNotifications /> : <HubAnnouncements />}
    </div>
  );
}
