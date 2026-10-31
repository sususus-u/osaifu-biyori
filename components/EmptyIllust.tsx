// 一覧がからっぽのときの絵(依頼366 仕事4。場面の絵 empty、おさいふびよりの色)。
// 点線の枠(.list-empty)の中の、文の上に置く。絵は飾り(読み上げは、すぐ下の文で伝える)。
import { SCENE_COLORS, SceneIllust } from "@/lib/scene-illust";

export default function EmptyIllust() {
  return <SceneIllust scene="empty" colors={SCENE_COLORS.osaifu} size={56} className="list-empty-illust" />;
}
