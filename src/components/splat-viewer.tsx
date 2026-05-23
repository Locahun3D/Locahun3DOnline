"use client";

/**
 * Spark 2.0 / 3DGS walkthrough viewer.
 *
 * Implementation: the standalone single-HTML offline viewer
 * (public/viewer/offline-viewer.html, ~1.2 MB Spark + Three.js + UI bundle)
 * is embedded in an <iframe>. The splat URL is passed via the
 * `?autoload=<encoded>` query param the viewer already supports
 * (see line ~13368 of the viewer source).
 *
 * Pros of this approach:
 *  - Zero rebuild risk — same code that runs on viewer.locahun3d.com
 *  - Isolated scope: viewer's globals, WebGL context, fonts don't
 *    leak into the parent React tree
 *  - All FPS tuning + flicker defenses ported automatically
 *
 * Cons / future work:
 *  - Iframe overhead is small but not zero (~30 ms extra mount)
 *  - Inter-frame communication (e.g. token consumption tracking, annotation
 *    placement in Phase 2) needs postMessage bridge — TODO when needed
 *  - The viewer assumes its own URL params (?lod, ?smooth, ?qual etc.).
 *    Add them to the iframe src when we want power-user controls.
 */
import { useMemo } from "react";

interface Props {
  src: string;
}

export default function SplatViewer({ src }: Props) {
  // Build the iframe URL with the splat autoload param.
  const iframeSrc = useMemo(() => {
    if (!src) return "/viewer/offline-viewer.html";
    return `/viewer/offline-viewer.html?autoload=${encodeURIComponent(src)}`;
  }, [src]);

  return (
    <div className="relative aspect-video border border-line bg-black overflow-hidden">
      <iframe
        src={iframeSrc}
        title="3DGS walkthrough viewer"
        className="absolute inset-0 w-full h-full border-0"
        // Allow fullscreen + pointer/sensor APIs the viewer might need.
        allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"
        // sandbox kept loose so Spark can do everything it needs;
        // tighten later if we add untrusted user content.
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"
        loading="lazy"
      />
    </div>
  );
}
