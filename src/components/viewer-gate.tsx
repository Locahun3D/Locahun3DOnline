"use client";

import { useState } from "react";
import Link from "next/link";

interface SplatItem {
  label: string;
  splatUrl: string;
  previewVideoUrl?: string;
  sizeMb: number;
  notes: string;
  accessLevel?: "public" | "restricted" | "nda_only";
}

interface Props {
  splatUrl: string;
  propertyId: string;
  /** Token consumed per single walkthrough open. 1 = house, 2 = medium, 3 = dome. */
  tokenCost?: 1 | 2 | 3;
  /** TODO: replace with real subscription check via Clerk publicMetadata */
  hasSubscription?: boolean;
  /** 限定無料期間中: トークン消費なしで全データを閲覧可能。 */
  freeAccess?: boolean;
  /** 個別3DGSデータ（フロア・区画別） */
  splatItems?: SplatItem[];
  /** Whether the current user can view restricted/backyard items. */
  canViewRestricted?: boolean;
  /** Whether the current user can view NDA-only items (dome structures, rigging etc.). */
  canViewNdaOnly?: boolean;
}

const SIZE_LABEL: Record<1 | 2 | 3, string> = {
  1: "ハウス / 小規模",
  2: "中規模スタジオ",
  3: "ドーム / 大規模",
};

/**
 * Gate the 3DGS walkthrough viewer.
 *
 * On click, the offline viewer (public/viewer/offline-viewer.html) is opened
 * in a new tab with the splat URL passed via `?autoload=`. The browser tab
 * itself becomes the fullscreen viewer surface — no embedded iframe in the
 * property detail page. This keeps the parent page interactive (gallery,
 * filters, etc.) while the heavy WebGL workload runs in its own process.
 */
export default function ViewerGate({
  splatUrl,
  propertyId,
  tokenCost = 1,
  hasSubscription = false,
  freeAccess = false,
  splatItems = [],
  canViewRestricted = false,
  canViewNdaOnly = false,
}: Props) {
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inlineOpen, setInlineOpen] = useState(false);
  const [fullMode, setFullMode] = useState(false);

  const items = splatItems.filter(it => {
    if (!it.splatUrl) return false;
    if (it.accessLevel === "restricted" && !canViewRestricted) return false;
    if (it.accessLevel === "nda_only" && !canViewNdaOnly) return false;
    return true;
  });
  const hasMultiple = items.length > 0;
  const activeSplatUrl = hasMultiple ? items[selectedIdx]?.splatUrl ?? splatUrl : splatUrl;
  const activeVideoUrl = hasMultiple ? items[selectedIdx]?.previewVideoUrl : undefined;

  const devBypass = process.env.NODE_ENV !== "production";
  // 限定無料期間中は、プラン・トークンに関わらず誰でも閲覧可能。
  const effectiveSubscription = hasSubscription || devBypass || freeAccess;

  const proxiedSplatUrl = activeSplatUrl && /^https?:\/\//.test(activeSplatUrl)
    ? `/api/admin/splat-proxy?url=${encodeURIComponent(activeSplatUrl)}`
    : activeSplatUrl;

  const previewUrl = proxiedSplatUrl
    ? `/viewer/offline-viewer.html?autoload=${encodeURIComponent(proxiedSplatUrl)}&orbit=1`
    : "/viewer/offline-viewer.html";

  const fullViewerUrl = proxiedSplatUrl
    ? `/viewer/offline-viewer.html?autoload=${encodeURIComponent(proxiedSplatUrl)}`
    : "/viewer/offline-viewer.html";

  const viewerUrl = fullMode ? fullViewerUrl : previewUrl;

  if (!effectiveSubscription) {
    return (
      <div className="relative aspect-video border border-line overflow-hidden">
        {/* Blurred placeholder preview */}
        <div
          className="absolute inset-0 bg-[#222]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, rgba(94,200,232,.18) 0%, transparent 60%), radial-gradient(circle at 30% 70%, rgba(255,255,255,.06) 0%, transparent 50%)",
            filter: "blur(1px)",
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 backdrop-blur-sm bg-black/40">
          <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-4">
            ● Subscriber only · {tokenCost} トークン消費
          </div>
          <div className="serif text-2xl md:text-3xl font-bold leading-[1.5] max-w-[26ch] mb-4">
            3DGS ウォークスルーは
            <br />
            メンバー限定です。
          </div>
          <div className="mono text-[10px] tracking-[0.22em] uppercase text-muted mb-4">
            このスタジオ ({SIZE_LABEL[tokenCost]}) は{" "}
            <span className="text-accent">{tokenCost} トークン</span>
            {" "}消費 / 視聴
          </div>
          <p className="text-[13px] text-muted max-w-[42ch] leading-[1.85] mb-6">
            実空間を 3D で歩き回り、レンズ画角・天井距離・光源位置を
            ブラウザだけで検証できます。
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href={`/pricing?from=${propertyId}`}
              className="px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
            >
              プランを見る
            </Link>
            <Link
              href={`/sign-in?redirect=/properties/${propertyId}`}
              className="px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-line hover:border-ink transition"
            >
              既にメンバー Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const trackOpen = () => {
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        propertyId,
        type: "viewer_open",
        referrer: document.referrer,
      }),
      keepalive: true,
    }).catch(() => {});
  };

  const activateFullMode = () => {
    // TODO: replace with real token consumption API call
    // await fetch("/api/tokens/consume", { method: "POST", body: JSON.stringify({ propertyId, cost: tokenCost }) });
    setFullMode(true);
    trackOpen();
  };

  // Inline iframe mode
  if (inlineOpen) {
    return (
      <div className="relative border border-line overflow-hidden bg-[#0a0a0a]">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#111] border-b border-line">
          {fullMode && hasMultiple && items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setSelectedIdx(i); }}
              className={`px-3 py-1 mono text-[9px] tracking-[0.22em] uppercase border transition ${
                selectedIdx === i
                  ? "border-accent text-accent bg-accent/10"
                  : "border-line text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {it.label || `#${i + 1}`}
            </button>
          ))}
          {!fullMode && (
            <span className="mono text-[9px] tracking-[0.22em] uppercase text-muted">
              プレビュー中 — クリックで操作開始
            </span>
          )}
          <div className="flex-1" />
          {fullMode && (
            <a
              href={fullViewerUrl}
              target="_blank"
              rel="noopener"
              className="px-3 py-1 mono text-[9px] tracking-[0.22em] uppercase border border-line text-muted hover:border-accent hover:text-accent transition"
            >
              別タブで開く ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => { setInlineOpen(false); setFullMode(false); }}
            className="px-3 py-1 mono text-[9px] tracking-[0.22em] uppercase border border-line text-muted hover:border-red-400 hover:text-red-400 transition"
          >
            閉じる ✕
          </button>
        </div>
        <div className="relative">
          {activeVideoUrl && !fullMode ? (
            <video
              key={`video-${selectedIdx}`}
              ref={el => { if (el) el.play().catch(() => {}); }}
              src={activeVideoUrl}
              preload="auto"
              className="w-full aspect-video object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <iframe
              key={`${selectedIdx}-${fullMode ? "full" : "preview"}`}
              src={viewerUrl}
              className="w-full aspect-video"
              allow="accelerometer; gyroscope; xr-spatial-tracking"
              style={{ border: "none" }}
            />
          )}
          {!fullMode && (
            <button
              type="button"
              onClick={activateFullMode}
              className="absolute inset-0 w-full h-full cursor-pointer group"
              aria-label="ウォークスルーを開始"
            >
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none">
                <div className="px-5 py-2.5 bg-black/70 backdrop-blur-sm border border-accent/60 rounded mono text-[10px] tracking-[0.22em] uppercase text-accent group-hover:bg-accent group-hover:text-bg transition">
                  {freeAccess
                    ? "クリックして操作開始（無料）"
                    : `クリックして操作開始（${tokenCost} トークン消費）`}
                </div>
              </div>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Subscribed: gate with inline-preview + new-tab options
  return (
    <div className="relative aspect-video border border-line overflow-hidden bg-[#141414]">
      {/* Background gradient hint */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at center, rgba(94,200,232,.10) 0%, transparent 65%), radial-gradient(circle at 30% 70%, rgba(255,255,255,.04) 0%, transparent 50%)",
        }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div
          className={`mono text-[10px] tracking-[0.32em] uppercase mb-3 ${
            freeAccess ? "text-green-400" : "text-accent"
          }`}
        >
          {freeAccess ? "● 限定無料期間中 · トークン消費なし" : "● 3DGS WALKTHROUGH READY"}
        </div>

        <div className="serif text-2xl md:text-3xl font-bold leading-[1.4] max-w-[28ch] mb-3">
          3DGS ウォークスルー
        </div>

        <div className="mono text-[10px] tracking-[0.22em] uppercase text-muted mb-2">
          このスタジオ ({SIZE_LABEL[tokenCost]}) は{" "}
          {freeAccess ? (
            <span className="text-green-400">無料期間中 · トークン消費なし</span>
          ) : (
            <>
              <span className="text-accent">{tokenCost} トークン</span> 消費 / 視聴
            </>
          )}
        </div>

        <p className="text-[11px] text-muted max-w-[44ch] leading-[1.75] mb-6">
          ページ内プレビューまたは別タブで全画面表示できます。
        </p>

        {hasMultiple && (
          <div className="flex flex-wrap gap-2 mb-5">
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setSelectedIdx(i); setOpenedAt(null); }}
                className={`px-4 py-2 mono text-[10px] tracking-[0.22em] uppercase border transition ${
                  selectedIdx === i
                    ? "border-accent text-accent bg-accent/10"
                    : "border-line text-muted hover:border-ink hover:text-ink"
                }`}
              >
                {it.label || `#${i + 1}`}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={() => { setInlineOpen(true); trackOpen(); }}
            className="inline-flex items-center gap-2 px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            この場でプレビュー ▶
          </button>
          <a
            href={fullViewerUrl}
            target="_blank"
            rel="noopener"
            onClick={() => { setOpenedAt(Date.now()); trackOpen(); }}
            className="inline-flex items-center gap-2 px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-line text-muted hover:border-ink hover:text-ink transition"
          >
            別タブで全画面 ↗
          </a>
        </div>

        <p className="mt-5 mono text-[9px] tracking-[0.22em] uppercase opacity-50">
          ⚠ 大容量 3DGS データ · Wi-Fi 推奨
        </p>
      </div>
    </div>
  );
}
