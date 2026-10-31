// 失敗・上限の知らせの文に、場面の絵を小さく添える(依頼366 仕事4。絵は lib/scene-illust.jsx、色は SCENE_COLORS.osaifu)。
// どの文に絵を添えるかは lib/sceneNotice.ts。入力の確かめの文には絵を添えず、今までどおり文だけ。
// 絵は飾り(読み上げは文で伝える)。絵には赤を使わない(文の色は、置いた所の決まりのまま)。
import type { CSSProperties } from "react";
import { SCENE_COLORS, SceneIllust } from "@/lib/scene-illust";
import { sceneForMessage } from "@/lib/sceneNotice";

export default function SceneNotice({
  message,
  textStyle,
  textClassName,
  style,
}: {
  message: string;
  textStyle?: CSSProperties;
  textClassName?: string;
  style?: CSSProperties;
}) {
  const scene = sceneForMessage(message);
  if (!scene) {
    return (
      <p className={textClassName} style={{ ...textStyle, ...style }}>
        {message}
      </p>
    );
  }
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
      <SceneIllust scene={scene} colors={SCENE_COLORS.osaifu} size={40} />
      <p className={textClassName} style={{ flex: 1, minWidth: 0, margin: 0, ...textStyle }}>
        {message}
      </p>
    </div>
  );
}
