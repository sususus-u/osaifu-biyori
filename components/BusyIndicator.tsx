"use client";

// 写真の準備中・読み取り中の表示。画面の中央に、薄く暗くした背景と白いカードで出す(背景は、二重の操作も防ぐ)。
// 回るアイコンは CSS だけ(外部の画像・ライブラリは使わない。CSP のため)。動きを減らす設定では、回転をやめて点滅にする(globals.css)。
// 出す文言と条件は lib/busyView.ts。
export default function BusyIndicator({ title, note }: { title: string; note?: string }) {
  return (
    <div className="busy-overlay">
      <div className="busy-card" role="status" aria-live="polite">
        <div className="busy-spinner" aria-hidden="true" />
        <p className="busy-title">{title}</p>
        {note ? <p className="busy-note">{note}</p> : null}
      </div>
    </div>
  );
}
