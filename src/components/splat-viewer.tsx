"use client";

/**
 * Spark 2.0 (3DGS) viewer placeholder.
 *
 * Implementation plan (deferred until paywall + auth are wired):
 *   1) `npm i @sparkjsdev/spark three`
 *   2) Mount a Three.js renderer in `mountRef`
 *   3) `SplatMesh({ url: src })` from @sparkjsdev/spark
 *   4) Reuse fps-investigation tuning from offline viewer
 *      (FRAME_MS gate removed, splat-active 4s, lerp tail 300ms — see memory)
 *
 * Until then this renders a clearly-labelled placeholder so the layout works.
 */
import { useEffect, useRef } from "react";

export default function SplatViewer({ src }: { src: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // intentionally empty — real Spark integration lands in the viewer task.
    return () => {};
  }, [src]);

  return (
    <div className="relative aspect-video border border-line bg-black overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-3">
          ● 3DGS PREVIEW
        </div>
        <div className="serif text-xl mb-2">Spark 2.0 viewer placeholder</div>
        <p className="text-[12px] text-muted max-w-[44ch] leading-[1.85] break-all">
          Splat source: <span className="mono opacity-70">{src}</span>
        </p>
        <p className="text-[11px] opacity-50 mt-3 max-w-[44ch]">
          実装は <code className="mono">components/splat-viewer.tsx</code> のコメント参照。
          Three.js + Spark のマウントは次フェーズで結線します。
        </p>
      </div>
      <div className="absolute top-3 left-3 mono text-[10px] tracking-[0.28em] uppercase opacity-60">
        REC ● 3DGS
      </div>
      <div className="absolute top-3 right-3 mono text-[10px] tracking-[0.28em] uppercase opacity-60">
        FOV 50mm
      </div>
      <div className="absolute bottom-3 left-3 mono text-[10px] tracking-[0.28em] uppercase opacity-60">
        WASD / drag — placeholder
      </div>
    </div>
  );
}
