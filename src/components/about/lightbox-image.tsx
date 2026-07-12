"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * /about の参考スクリーンショット用画像。クリックで原寸拡大（ライトボックス）。
 * Escape キー・背景クリック・×ボタンで閉じる。
 */
export default function LightboxImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  /** サムネイル側 <img> に付けるクラス。 */
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    // 背面スクロールを止める
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in ${className}`}
      />
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={close}
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4 sm:p-8"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain bg-white cursor-zoom-out"
          />
          <button
            type="button"
            aria-label={"閉じる"}
            onClick={close}
            className="absolute top-4 right-4 w-9 h-9 grid place-items-center rounded-full bg-white/15 text-white text-[18px] hover:bg-white/30 transition"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
