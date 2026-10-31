// 写し(手で書き換えない)。正本: ハブ(okizukibiyori-hub)の src/lib/scene-illust.jsx
// 正本の版: ea6aa7f56da2ea52 / 写しの中身の版: ea6aa7f56da2ea52
// 正本を直したら、ハブで node scripts/scene-illust-copy.mjs を実行して写し直す(依頼366 仕事4)。
// 場面の絵(BRAND.md 5章「場面の絵の家族」。依頼366 仕事4 で、案A「しるしの点」に決めた)。ハブが正本。
// 3つのサービスへ、同じ中身を写す(写しの頭に、正本の版を書く。ログインの部品と同じ考え。docs/scene-illust.md)。
// 4つのアプリでそのまま使えるよう、型を書かない JavaScript(JSX)にし、ほかのファイルを import しない。
// 見た目の決まり:
// - 線の太さは、全部 STROKE で同じ。しるし(14章「気づきの点」)の円弧と点が主役で、点が場面ごとに形を変える。
// - 色は、そのアプリの色(SCENE_COLORS)。失敗・上限の絵も、サービスの色で描く(赤は使わない)。
// - 動きは CSS だけ。端末で「動きを減らす」にしている人には、止める。
// - 文字は、絵の下に短く(SceneMessage)。絵は飾りとして扱い、読み上げは文字で伝える。

/** 場面の名前(この8つだけ) */
export const SCENE_KINDS = ["waiting", "empty", "error", "saved", "limit", "login", "offline", "welcome"];

/** 線の太さ(64×64 の中で 2) */
export const STROKE = 2;

/** アプリごとの色。line = 線(そのアプリの色)、accent = 点(しるしの金)、surface = 物の中の面 */
export const SCENE_COLORS = {
  home: { line: "#2c2a24", accent: "#ad8a4c", surface: "#fffdf8" },
  mamori: { line: "#1f3a52", accent: "#ad8a4c", surface: "#ffffff" },
  tabe: { line: "#3b7f3b", accent: "#ad8a4c", surface: "#ffffff" },
  osaifu: { line: "#6e2a32", accent: "#ad8a4c", surface: "#ffffff" },
};

/** 動き(絵の中に入れる。何度入っても同じ) */
export const SCENE_ILLUST_CSS = `
.si-spin { transform-box: view-box; animation: si-spin 1.6s linear infinite; }
.si-pulse { transform-box: fill-box; transform-origin: center; animation: si-pulse 1.2s ease-in-out infinite alternate; }
.si-draw { stroke-dasharray: 1; animation: si-draw 0.6s ease-out 0.2s both; }
@keyframes si-spin { to { transform: rotate(360deg); } }
@keyframes si-pulse { from { opacity: 1; transform: scale(1); } to { opacity: 0.45; transform: scale(0.8); } }
@keyframes si-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) {
  .si-spin, .si-pulse, .si-draw { animation: none !important; }
}
`;

// しるしの円弧(右上に約86度の切れ目。BRAND.md 14章)
function markArc(cx, cy, r) {
  const a1 = (-2 * Math.PI) / 180;
  const a2 = (-88 * Math.PI) / 180;
  const p = (a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(a1)} A ${r} ${r} 0 1 1 ${p(a2)}`;
}

function sceneBody(scene, c) {
  const cx = 28;
  const cy = 36;
  const r = 18;
  const dx = cx + 17;
  const dy = cy - 17;
  const arc = <path d={markArc(cx, cy, r)} />;
  const dot = <circle cx={dx} cy={dy} r={7} fill={c.accent} stroke="none" />;
  const hollowDot = <circle cx={dx} cy={dy} r={6} stroke={c.accent} />;
  switch (scene) {
    case "waiting":
      // 円弧と点が、ゆっくり回る
      return (
        <g className="si-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {arc}
          {dot}
        </g>
      );
    case "empty":
      // 点が、まだ点線(これから入る)
      return (
        <>
          {arc}
          <circle cx={dx} cy={dy} r={6} stroke={c.accent} strokeDasharray="2 3.2" />
        </>
      );
    case "error":
      // 点が抜けて、中に「!」
      return (
        <>
          {arc}
          {hollowDot}
          <path d={`M ${cx} ${cy - 9} V ${cy + 2}`} />
          <circle cx={cx} cy={cy + 8} r={1.5} fill={c.line} stroke="none" />
        </>
      );
    case "saved":
      // 点が入り、中にしるし(✓)が描かれる
      return (
        <>
          {arc}
          {dot}
          <path className="si-draw" pathLength={1} d={`M ${cx - 8} ${cy} L ${cx - 2} ${cy + 6} L ${cx + 9} ${cy - 6}`} />
        </>
      );
    case "limit":
      // 切れ目が閉じた(もう入らない)。中に、ふちまでの線
      return (
        <>
          <circle cx={cx} cy={cy} r={r} />
          <path d={`M ${cx - 13} ${cy - 10} H ${cx + 13}`} stroke={c.accent} />
          <path d={`M ${cx - 16} ${cy - 3} H ${cx + 16}`} stroke={c.accent} />
          <circle cx={dx + 3} cy={dy - 3} r={6} fill={c.accent} stroke="none" />
        </>
      );
    case "login":
      // 中に、かぎ穴
      return (
        <>
          {arc}
          {dot}
          <circle cx={cx} cy={cy - 3} r={4} />
          <path d={`M ${cx} ${cy + 1} V ${cy + 9}`} />
        </>
      );
    case "offline":
      // 円弧が途切れ、点が抜ける
      return (
        <>
          <path d={markArc(cx, cy, r)} strokeDasharray="3 5" />
          {hollowDot}
        </>
      );
    case "welcome":
    default:
      // 点が、ふわっと光る
      return (
        <>
          {arc}
          <circle className="si-pulse" cx={dx} cy={dy} r={7} fill={c.accent} stroke="none" />
          <g stroke={c.accent}>
            <path d={`M ${dx} ${dy - 11} V ${dy - 14}`} />
            <path d={`M ${dx + 8} ${dy - 8} L ${dx + 10} ${dy - 10}`} />
            <path d={`M ${dx + 11} ${dy} H ${dx + 14}`} />
          </g>
        </>
      );
  }
}

/**
 * 場面の絵。
 * props: scene(SCENE_KINDS のどれか)、colors(SCENE_COLORS.〇〇。既定はホーム)、size(既定 64)、
 *        title(付けると読み上げの名前になる。付けないときは飾り)、className
 * @param {{ scene: string, colors?: { line: string, accent: string, surface: string }, size?: number | string, title?: string, className?: string }} props
 */
export function SceneIllust({ scene, colors = SCENE_COLORS.home, size = 64, title, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke={colors.line}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <style>{SCENE_ILLUST_CSS}</style>
      {sceneBody(scene, colors)}
    </svg>
  );
}

/**
 * 絵と、短い文字と、ボタンなど(children)を、まん中にそろえて並べる。
 * props: scene、colors、text(短い文字。1〜2行)、sub(補いの文字。なくてよい)、children、size(既定 64)、
 *        role(待っている間は "status"、うまくいかなかったときは "alert" など。既定なし)
 * 字の大きさと色は、置いた所のものを引き継ぐ(各アプリの決まりの字の大きさ・濃さのまま)。
 * @param {{ scene: string, colors?: { line: string, accent: string, surface: string }, text?: unknown, sub?: unknown, children?: unknown, size?: number, role?: string }} props
 */
export function SceneMessage({ scene, colors, text, sub, children, size = 64, role }) {
  return (
    <div
      role={role}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "24px 16px",
        textAlign: "center",
      }}
    >
      <SceneIllust scene={scene} colors={colors} size={size} />
      {text ? <p style={{ margin: 0, lineHeight: 1.6 }}>{text}</p> : null}
      {sub ? <p style={{ margin: 0, lineHeight: 1.6 }}>{sub}</p> : null}
      {children}
    </div>
  );
}
