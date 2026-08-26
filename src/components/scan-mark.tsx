/**
 * ロケハン3D scan-target mark — corner brackets + blue reticle.
 * Ported from the manifesto site (web.locahun3d.com). Inherits size via props.
 *
 * ⚠ 2026-08-16: 既定のレティクル色を旧アクセントのオレンジ #ffb454 から
 *   テーマ青 #1ea0c4 へ統一（本人指示「ここの色、青だけにして」→「修正」で #5ec8e8 から変更 2026-08-16）。
 *   ヘッダーはモノクロ＋青のみの構成にする。使用箇所は HeaderMark のみ。
 */
export default function ScanMark({
  size = 58,
  className = "",
  /** Reticle (center) color. 既定＝オンラインの青。 */
  reticle = "#1ea0c4",
}: {
  size?: number;
  className?: string;
  reticle?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="ロケハン3D"
      className={className}
    >
      <g
        fill="none"
        stroke="#f4f1ea"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 23V14H23" />
        <path d="M41 14H50V23" />
        <path d="M14 41V50H23" />
        <path d="M50 41V50H41" />
      </g>
      <circle cx="32" cy="32" r="7" fill="none" stroke={reticle} strokeWidth="3" />
      <circle cx="32" cy="32" r="2.4" fill={reticle} />
    </svg>
  );
}
