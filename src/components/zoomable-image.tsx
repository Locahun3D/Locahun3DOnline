"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * クリックで全画面表示できる画像。ギャラリーのセルを object-cover で埋めつつ、
 * クリックすると元画像を全体表示（object-contain）する軽量ライトボックス。
 *
 * モーダルは `createPortal` で `document.body` 直下に描画する。祖先要素に
 * `transform`（例: ギャラリーの「傾いた写真」演出）が付いていると、CSS の仕様上
 * その要素が `position: fixed` 子要素の新しい containing block になってしまい、
 * `fixed inset-0` が画面全体ではなく祖先の小さな箱に閉じ込められる。ポータルで
 * body 直下に出すことで、どこに置かれても常に本当のフルスクリーンになる。
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const modal = open && (
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
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute top-4 right-5 text-white/80 hover:text-white text-[32px] leading-none"
      >
        ×
      </button>
    </div>
  );

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onClick={() => setOpen(true)}
        className={`${className} cursor-zoom-in`}
        style={{ objectPosition: focus || "center" }}
      />
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
