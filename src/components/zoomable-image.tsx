"use client";

import { useEffect, useState } from "react";

/**
 * クリックで全画面表示できる画像。ギャラリーのセルを object-cover で埋めつつ、
 * クリックすると元画像を全体表示（object-contain）する軽量ライトボックス。
 */
export default function ZoomableImage({
  src,
  alt,
  focus,
  className = "",
}: {
  src: string;
  alt: string;
  focus?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className={`${className} cursor-zoom-in`}
        style={{ objectPosition: focus || "center" }}
      />
      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/92 flex items-center justify-center p-4 sm:p-8 cursor-zoom-out"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain select-none"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-5 text-white/80 hover:text-white text-[32px] leading-none"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
