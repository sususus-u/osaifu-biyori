"use client";

// 写真の準備中・読み取り中の表示。画面の中央に、薄く暗くした背景と白いカードで出す(背景は、二重の操作も防ぐ)。
// 絵は、共通の場面の絵「待っている間」(lib/scene-illust.jsx。依頼366 仕事4 で、前の回る輪から置き換えた)。
// 動きは CSS だけ。端末で「動きを減らす」にしている人には止まる(絵の部品の CSS)。
// 出す文言と条件は lib/busyView.ts。
import { SCENE_COLORS, SceneIllust } from "@/lib/scene-illust";

export default function BusyIndicator({ title, note }: { title: string; note?: string }) {
  return (
    <div className="busy-overlay">
      <div className="busy-card" role="status" aria-live="polite">
        <div className="busy-illust">
          <SceneIllust scene="waiting" colors={SCENE_COLORS.osaifu} size={64} />
        </div>
        <p className="busy-title">{title}</p>
        {note ? <p className="busy-note">{note}</p> : null}
      </div>
    </div>
  );
}
