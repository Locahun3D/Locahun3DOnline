"use client";

import { useEffect, useRef, useState } from "react";
import { buildViewerUrl } from "@/lib/viewer";

/**
 * 共有リンクからビューアーへ入る。開いたらすぐ署名URL（15分有効）を取り、同じタブでビューアーへ移る
 * （2026-11-10 本人指示: 「3Dビューを開く」の中継画面はいらない）。location.replace なので戻る操作でループしない。
 * 失敗したときだけボタンを出して、押し直せるようにする。
 * `shared=1` を付けて、ビューアー側の「共有」ボタンを出さない（受け取った人は再共有できない）。
 */
export default function ShareViewerLauncher({ token, assetKey, en }: { token: string; assetKey: string; en: boolean }) {
  const [state, setState] = useState<"loading" | "error">("loading");
  const started = useRef(false);

  const open = async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/viewer-asset?key=${encodeURIComponent(assetKey)}&share=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { url?: string; streamUrl?: string }) : null;
      if (!data?.url) return setState("error");
      window.location.replace(`${buildViewerUrl(data.url, { protected: true, streamRef: data.streamUrl })}&shared=1`);
    } catch {
      setState("error");
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state !== "error") {
    return (
      <p className="text-[13px] text-muted" role="status">
        {en ? "Opening the 3D view…" : "3Dビューを開いています…"}
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center justify-center min-h-[48px] px-8 font-bold text-[14px] bg-accent border border-accent text-[#0a2a35] hover:brightness-[1.06] transition"
      >
        {en ? "Open the 3D view" : "3Dビューを開く"}
      </button>
      <p className="mt-4 text-[13px] text-[#c0392b]" role="alert">
        {en ? "Could not open the view. Please try again in a moment." : "開けませんでした。少し待ってからもう一度お試しください。"}
      </p>
      <p className="mt-5 text-[12px] text-muted">
        {en ? "Large data. Wi-Fi is recommended." : "データが大きいため、Wi-Fi 環境での閲覧をおすすめします。"}
      </p>
    </div>
  );
}
