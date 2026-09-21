"use client";

import { useEffect, useRef, useState } from "react";
import { buildViewerUrl } from "@/lib/viewer";

/**
 * 掲載スタジオのサイトに貼られた iframe の中で、3Dツアーを**その場で**動かすための部品
 * （2026-09-21 本人指示「向こうのサイトに埋め込める3Dビューアーのリンク」「Matterportを参考に」）。
 *
 * これまでの埋め込みページは、押すと**新しいタブ**でビューアーを開く作りだった。
 * 貼った側から見ると「サイトの中で歩ける」ようには見えず、埋め込みの意味が薄い。
 * Matterport は iframe の中でそのまま動く。ここも同じにする。
 *
 * 重いデータ（数百MB）なので、既定では**押してから**読み込む（Matterport の play=1 と同じ考え方）。
 * ページを開いただけで全員ぶん転送すると、先方のサイトの表示も当社の転送量も重くなる。
 * `autoplay` を付けたときだけ、最初から読み込む。
 */
export default function EmbedPlayer({
  splatUrl,
  embedToken,
  label,
  previewVideoUrl,
  autoplay = false,
  en = false,
}: {
  splatUrl: string;
  embedToken: string;
  label: string;
  previewVideoUrl?: string;
  autoplay?: boolean;
  en?: boolean;
}) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const started = useRef(false);

  const start = async () => {
    if (started.current) return;
    started.current = true;
    setState("loading");
    try {
      const res = await fetch(
        `/api/viewer-asset?key=${encodeURIComponent(splatUrl)}&embed=${encodeURIComponent(embedToken)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { url?: string; streamUrl?: string };
      if (!data.url) throw new Error("no url");
      setViewerUrl(buildViewerUrl(data.url, { protected: true, streamRef: data.streamUrl }));
      setState("idle");
    } catch {
      started.current = false;
      setState("error");
    }
  };

  useEffect(() => {
    // autoplay=1 のときだけ、描画のあとに開始する。started で二重起動を防ぐ。
    if (!autoplay) return;
    const id = setTimeout(() => void start(), 0);
    return () => clearTimeout(id);
    // start は ref で二重起動を止めているため依存に入れない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay]);

  if (viewerUrl) {
    return (
      <iframe
        src={viewerUrl}
        title={label}
        className="block w-full h-full border-0"
        allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      className="group relative block w-full h-full overflow-hidden bg-[#141414] text-left"
      aria-label={en ? `Start the 3D tour: ${label}` : `3Dツアーを開始: ${label}`}
    >
      {previewVideoUrl ? (
        // 回転プレビュー動画をサムネイルにする（音は無し・端末の判断で自動再生）。
        <video
          src={previewVideoUrl}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, rgba(94,200,232,.12) 0%, transparent 65%)",
          }}
        />
      )}
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 transition group-hover:bg-black/55">
        <span className="flex items-center justify-center w-16 h-16 rounded-full border-2 border-white/80 text-white">
          {state === "loading" ? (
            <span className="mono text-[10px] tracking-[0.2em]">…</span>
          ) : (
            <svg viewBox="0 0 24 24" className="w-7 h-7 translate-x-[2px]" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </span>
        <span className="mono text-[11px] tracking-[0.28em] uppercase text-white drop-shadow">
          {state === "loading"
            ? en ? "Loading…" : "読み込み中…"
            : state === "error"
              ? en ? "Could not start. Tap to retry." : "開始できませんでした。もう一度押してください。"
              : en ? "Start 3D tour" : "3Dツアーを開始"}
        </span>
      </span>
    </button>
  );
}
