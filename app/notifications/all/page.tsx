"use client";

// 「過去のお知らせ」。運営からのお知らせを、利用者が自分の画面から消したものも
// 含めてすべて表示する。見るだけの画面なので、選ぶ・消すなどの操作は置かない。

import Link from "next/link";
import { ANNOUNCEMENT_EMPTY_TEXT, timeLabel, useAnnouncements } from "@/lib/announcements";
import { listCountText } from "@/lib/listCount";

export default function PastAnnouncementsPage() {
  const announcements = useAnnouncements();

  return (
    <div>
      <Link href="/notifications" className="back-link">
        ← お知らせに戻る
      </Link>

      {announcements === null ? (
        <div className="loading-state">読み込み中…</div>
      ) : announcements.length === 0 ? (
        <div className="list-empty">
          <p>{ANNOUNCEMENT_EMPTY_TEXT}</p>
        </div>
      ) : (
        <>
          {announcements.map((a) => (
            <div className="notif-card announcement-card" key={a.id}>
              <div className="notif-body">
                <div className="notif-title">{a.title}</div>
                <div className="notif-desc">{a.body}</div>
                <div className="notif-time">{timeLabel(a.publishedAt)}</div>
              </div>
            </div>
          ))}
          {/* 最後のお知らせのすぐ下の真ん中に「全○件」(依頼270) */}
          <p className="list-count">{listCountText(announcements.length)}</p>
        </>
      )}
    </div>
  );
}
