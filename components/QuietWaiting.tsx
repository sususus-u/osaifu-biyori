"use client";

// 文字を出さない「待っている間」(依頼366 仕事3。ホームの src/components/quiet-waiting.tsx と同じ考え)。
// ホームから移ってきたときのログインの受け取り・確かめと、開いた直後の一覧の読み込みなど、すぐ終わる待ち時間に使う。
// すぐ終わるときは何も見えないよう、少し(既定 400ms)待ってから、場面の絵(waiting)だけをそっと出す。
// 読み上げには「読み込み中」とだけ伝える。端末で「動きを減らす」にしている人には、絵の動きとふわっと出す動きを止める。

import { useEffect, useState } from "react";
import { SCENE_COLORS, SceneIllust } from "@/lib/scene-illust";

export const QUIET_WAITING_DELAY_MS = 400;

export default function QuietWaiting({ delayMs = QUIET_WAITING_DELAY_MS, fill = false }: { delayMs?: number; fill?: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return (
    <div className={fill ? "quiet-waiting quiet-waiting-fill" : "quiet-waiting"} role="status" aria-live="polite">
      <span className="sr-only">読み込み中</span>
      {shown && (
        <div className="quiet-waiting-in">
          <SceneIllust scene="waiting" colors={SCENE_COLORS.osaifu} size={64} />
        </div>
      )}
    </div>
  );
}
