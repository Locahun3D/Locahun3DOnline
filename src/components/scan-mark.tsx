/**
 * ロケハン3D scan-target mark — corner brackets + amber reticle.
 * Ported from the manifesto site (web.locahun3d.com). Inherits size via props.
 */
export default function ScanMark({
  size = 58,
  className = "",
  /** Reticle (center) color. SCAN = amber (default), ONLINE = blue. */
  reticle = "#ffb454",
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
        strokeWidth="3.6"
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
