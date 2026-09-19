"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Photo = { src: string; alt: string; focus?: string };

/**
 * 物件ギャラリー（コンタクトシート風のグリッド）＋ 前後に送れるライトボックス。
 * 2026-09-19 UI改善会議「拡大した状態で次の画像に変えられるボタンが欲しい」。
 * ←/→ キー・左右スワイプ・ボタンで送る。Esc で閉じる。
 * モーダルは祖先の transform（傾いた写真の演出）の影響を受けないよう body 直下に出す。
 */
export default function GalleryLightbox({ photos, en }: { photos: Photo[]; en: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const step = useCallback(
    (d: number) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length)),
    [photos.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, step]);

  const current = open === null ? null : photos[open];

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {photos.map((p, i) => (
          <figure
            key={p.src}
            className="bg-white p-2 pb-7 relative shadow-[0_2px_8px_rgba(20,24,28,0.09)]"
            style={{ transform: i % 3 === 0 ? "rotate(-0.6deg)" : i % 3 === 2 ? "rotate(0.5deg)" : undefined }}
          >
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={en ? `Enlarge photo ${i + 1}` : `写真${i + 1}を拡大`}
              className="block w-full aspect-[4/3] overflow-hidden cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                alt={p.alt}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
                style={{ objectPosition: p.focus || "center" }}
              />
            </button>
            <figcaption className="absolute bottom-2 left-2.5 right-2.5 flex justify-between mono text-[10px] tracking-[0.2em] uppercase text-muted">
              <span>FRAME {String(i + 1).padStart(2, "0")}</span>
              <span className="truncate max-w-[50%] text-right">{p.alt}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {mounted && current &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={en ? "Photo viewer" : "写真ビューア"}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
            onClick={() => setOpen(null)}
            onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchX === null) return;
              const dx = e.changedTouches[0].clientX - touchX;
              if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
              setTouchX(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.src}
              alt={current.alt}
              className="max-w-[92vw] max-h-[82vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute top-3 left-4 mono text-[13px] text-white/80">
              {(open ?? 0) + 1} / {photos.length}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(null); }}
              aria-label={en ? "Close" : "閉じる"}
              className="absolute top-2 right-3 w-11 h-11 text-white text-[26px] leading-none hover:text-accent"
            >
              ×
            </button>
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); step(-1); }}
                  aria-label={en ? "Previous photo" : "前の写真"}
                  className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-white/30 text-white text-[26px] leading-none"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); step(1); }}
                  aria-label={en ? "Next photo" : "次の写真"}
                  className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-white/30 text-white text-[26px] leading-none"
                >
                  ›
                </button>
              </>
            )}
            {current.alt && (
              <p className="absolute bottom-4 left-0 right-0 text-center text-[13px] text-white/80 px-6">{current.alt}</p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
