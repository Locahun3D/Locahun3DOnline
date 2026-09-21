"use client";

import { useState } from "react";

type Plan = { label?: string; labelEn?: string; url: string };

const isImage = (url: string) => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url);

/**
 * 平面図ビューアー（2026-09-20 本人指示「図面が複数あっても1枚分のスペースに。クリックで選んで見られるように」）。
 * - 画像の図面は 1 枠に 1 枚だけ表示し、上の切り替えタブ（2枚以上のときだけ出る）で選ぶ。枠の高さは固定なので、
 *   縦長の図面でも切り替えでもカードの高さが動かない。
 * - 枠を押すと、その場で大きく見られる（全画面の重ね表示。背景か × か Esc で閉じる。← → で前後）。
 * - PDF はブラウザ内プレビューが端末差で不安定なので、従来どおり下にダウンロード札で並べる。
 */
export default function FloorPlanViewer({ plans, en }: { plans: Plan[]; en: boolean }) {
  const images = plans.filter((p) => isImage(p.url));
  const files = plans.filter((p) => !isImage(p.url));
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const cur = images[Math.min(idx, images.length - 1)];
  // 2026-09-21: EN ページでは英語のラベルを使う（空なら日本語のまま）。
  const name = (p: Plan, i: number) =>
    (en ? p.labelEn || p.label : p.label) || (en ? `Plan ${i + 1}` : `図面 ${i + 1}`);
  const step = (d: number) => setIdx((i) => (i + d + images.length) % images.length);

  return (
    <div className="mt-6" data-floor-plans>
      <div className="mono text-[10px] tracking-[0.22em] uppercase text-muted mb-3">
        {en ? "Floor plans" : "平面図"}
        {images.length > 1 && <span className="ml-2 normal-case tracking-normal">{idx + 1} / {images.length}</span>}
      </div>

      {cur && (
        <div className="border border-line bg-white">
          {images.length > 1 && (
            <div role="tablist" aria-label={en ? "Floor plans" : "平面図"} className="flex flex-wrap gap-1.5 p-2 border-b border-line">
              {images.map((p, i) => (
                <button
                  key={p.url}
                  type="button"
                  role="tab"
                  aria-selected={i === idx}
                  onClick={() => setIdx(i)}
                  className={`min-h-[36px] px-3 text-[12.5px] border transition ${
                    i === idx ? "bg-ink text-white border-ink font-bold" : "border-line text-ink/75 hover:border-ink"
                  }`}
                >
                  {name(p, i)}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setZoom(true)}
            aria-label={en ? `Enlarge: ${name(cur, idx)}` : `${name(cur, idx)} を拡大`}
            className="block w-full p-2 cursor-zoom-in group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- R2配信の相対パスは next/image 最適化が404になる */}
            <img src={cur.url} alt={name(cur, idx)} loading="lazy" className="block w-full h-[300px] sm:h-[360px] object-contain bg-[#f4f5f6]" />
            <span className="flex items-center justify-between mt-2 px-1 text-[12px] text-ink/70">
              <span className="truncate">{name(cur, idx)}</span>
              <span className="font-bold group-hover:text-accent transition shrink-0 ml-3">{en ? "Enlarge ⤢" : "拡大 ⤢"}</span>
            </span>
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2 mt-3">
          {files.map((b, i) => (
            <a key={b.url} href={b.url} download target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[13px] border border-line px-3 py-2.5 hover:border-accent hover:text-accent transition">
              <span className="text-accent">⬇</span>
              <span className="flex-1 truncate text-[14px] text-ink/90 font-medium">{(en ? b.labelEn || b.label : b.label) || (en ? `File ${i + 1}` : `資料 ${i + 1}`)}</span>
              <span className="text-[12px] text-ink/70 font-bold">{en ? "Download PDF" : "PDFをダウンロード"}</span>
            </a>
          ))}
        </div>
      )}

      {zoom && cur && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name(cur, idx)}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={(e) => {
            if (e.key === "Escape") setZoom(false);
            if (e.key === "ArrowRight" && images.length > 1) step(1);
            if (e.key === "ArrowLeft" && images.length > 1) step(-1);
          }}
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-[200] bg-black/85 flex flex-col outline-none"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="text-[14px] font-bold truncate">
              {name(cur, idx)}
              {images.length > 1 && <span className="ml-2 font-normal text-white/60">{idx + 1} / {images.length}</span>}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {images.length > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} aria-label={en ? "Previous" : "前の図面"} className="w-11 h-11 border border-white/30 hover:border-white text-[18px]">←</button>
                  <button type="button" onClick={() => step(1)} aria-label={en ? "Next" : "次の図面"} className="w-11 h-11 border border-white/30 hover:border-white text-[18px]">→</button>
                </>
              )}
              <a href={cur.url} target="_blank" rel="noopener noreferrer" className="h-11 px-3 inline-flex items-center border border-white/30 hover:border-white text-[12px]">{en ? "Open original ↗" : "原寸で開く ↗"}</a>
              <button type="button" onClick={() => setZoom(false)} aria-label={en ? "Close" : "閉じる"} className="w-11 h-11 border border-white/30 hover:border-white text-[18px]">×</button>
            </span>
          </div>
          <div className="flex-1 min-h-0 p-3 sm:p-6 flex items-center justify-center cursor-zoom-out">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cur.url} alt={name(cur, idx)} className="max-w-full max-h-full object-contain bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
