"use client";

import { useState } from "react";
import { buildViewerUrl } from "@/lib/viewer";

/**
 * 共有リンクからビューアーへ入るボタン。押したときに署名URL（15分有効）を取り、同じタブでビューアーを開く。
 * 自動遷移にしないのは、3DGS が数百MBあるため（開く前に一呼吸おく）と、戻る操作でループしないため。
 * `shared=1` を付けて、ビューアー側の「共有」ボタンを出さない（受け取った人は再共有できない）。
 */
export default function ShareViewerLauncher({ token, assetKey, en }: { token: string; assetKey: string; en: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const open = async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/viewer-asset?key=${encodeURIComponent(assetKey)}&share=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { url?: string; streamUrl?: string }) : null;
      if (!data?.url) return setState("error");
      window.location.href = `${buildViewerUrl(data.url, { protected: true, streamRef: data.streamUrl })}&shared=1`;
    } catch {
      setState("error");
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={open}
        disabled={state === "loading"}
        className="inline-flex items-center justify-center min-h-[48px] px-8 font-bold text-[14px] bg-accent border border-accent text-[#0a2a35] hover:brightness-[1.06] transition disabled:opacity-60"
      >
        {state === "loading" ? (en ? "Opening…" : "開いています…") : en ? "Open the 3D view" : "3Dビューを開く"}
      </button>
      {state === "error" && (
        <p className="mt-4 text-[13px] text-[#c0392b]" role="alert">
          {en ? "Could not open the view. Please try again in a moment." : "開けませんでした。少し待ってからもう一度お試しください。"}
        </p>
      )}
      <p className="mt-5 text-[12px] text-muted">
        {en ? "Large data. Wi-Fi is recommended." : "データが大きいため、Wi-Fi 環境での閲覧をおすすめします。"}
      </p>
    </div>
  );
}
