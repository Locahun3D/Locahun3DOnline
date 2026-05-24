"use client";

import { useCallback, useEffect, useState } from "react";
import type { PropertyImage } from "@/lib/schemas";

export default function ImageGallery({ images }: { images: PropertyImage[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const close = useCallback(() => setOpenIdx(null), []);
  const next = useCallback(
    () => setOpenIdx((i) => (i === null ? null : (i + 1) % images.length)),
    [images.length],
  );
  const prev = useCallback(
    () =>
      setOpenIdx((i) =>
        i === null ? null : (i - 1 + images.length) % images.length,
      ),
    [images.length],
  );

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openIdx, close, next, prev]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            onClick={() => setOpenIdx(i)}
            className="group relative aspect-[4/3] overflow-hidden border border-line bg-[#141414] focus:outline-none focus:border-accent"
            aria-label={`画像を拡大: ${img.alt}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt={img.alt}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 mono text-[10px] tracking-[0.3em] uppercase border border-ink/60 px-2 py-1 transition">
                Zoom
              </span>
            </div>
          </button>
        ))}
      </div>

      {openIdx !== null && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="前の画像"
            className="absolute left-6 md:left-12 top-1/2 -translate-y-1/2 mono text-[10px] tracking-[0.3em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="次の画像"
            className="absolute right-6 md:right-12 top-1/2 -translate-y-1/2 mono text-[10px] tracking-[0.3em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
          >
            Next →
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="閉じる"
            className="absolute top-5 right-5 mono text-[10px] tracking-[0.3em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
          >
            Close ✕
          </button>
          <div
            className="absolute top-5 left-5 mono text-[10px] tracking-[0.3em] uppercase opacity-60"
          >
            {openIdx + 1} / {images.length}
          </div>

          <figure
            className="max-w-[92vw] max-h-[88vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[openIdx].src}
              alt={images[openIdx].alt}
              className="max-w-full max-h-[80vh] object-contain"
            />
            <figcaption className="mt-3 mono text-[11px] tracking-[0.2em] opacity-70">
              {images[openIdx].alt}
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
