"use client";

import Link from "next/link";
import { buildViewerUrl, proxySplatUrl } from "@/lib/viewer";

interface Props {
  splatUrl: string;
  propertyId: string;
  label: string;
  sizeMb: number;
  previewVideoUrl?: string;
  tokenCost?: 1 | 2 | 3;
  hasSubscription?: boolean;
  freeAccess?: boolean;
  signedIn?: boolean;
}

const SIZE_LABEL: Record<1 | 2 | 3, string> = {
  1: "ハウス / 小規模",
  2: "中規模スタジオ",
  3: "ドーム / 大規模",
};

export default function ViewerGate({
  splatUrl,
  propertyId,
  label,
  sizeMb,
  previewVideoUrl,
  tokenCost = 1,
  hasSubscription = false,
  freeAccess = false,
  signedIn = false,
}: Props) {
  const devBypass = process.env.NODE_ENV !== "production";
  const effectiveSubscription = hasSubscription || devBypass || freeAccess;

  const proxied = proxySplatUrl(splatUrl);
  const fullViewerUrl = buildViewerUrl(proxied);

  /* --- Paywall (no subscription) --- */
  if (!effectiveSubscription) {
    return (
      <div className="relative aspect-video border border-line overflow-hidden">
        {previewVideoUrl ? (
          <video
            src={previewVideoUrl}
            autoPlay loop muted playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        ) : (
          <div
            className="absolute inset-0 bg-[#222]"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at center, rgba(94,200,232,.18) 0%, transparent 60%), radial-gradient(circle at 30% 70%, rgba(255,255,255,.06) 0%, transparent 50%)",
              filter: "blur(1px)",
            }}
          />
        )}
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
            {/* サインイン済みの非会員には Sign in を出さない（プラン加入へ誘導）。 */}
            {!signedIn && (
              <Link
                href={`/sign-in?redirect=/properties/${propertyId}`}
                className="px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-line hover:border-ink transition"
              >
                既にメンバー Sign in
              </Link>
            )}
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
        meta: { label },
        referrer: document.referrer,
      }),
      keepalive: true,
    }).catch(() => {});
  };

  /* --- Always open in new tab --- */
  return (
    <div className="relative aspect-video border border-line overflow-hidden bg-[#141414]">
      {previewVideoUrl ? (
        <video
          src={previewVideoUrl}
          autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, rgba(94,200,232,.10) 0%, transparent 65%), radial-gradient(circle at 30% 70%, rgba(255,255,255,.04) 0%, transparent 50%)",
          }}
        />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 text-center px-6"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 40%, transparent 70%)" }}
      >
        <div
          className={`mono text-[10px] tracking-[0.32em] uppercase mb-3 ${
            freeAccess ? "text-green-400" : "text-accent"
          }`}
        >
          {freeAccess ? "● 限定無料期間中 · トークン消費なし" : `● ${sizeMb} MB`}
        </div>

        <p className="text-[11px] text-muted max-w-[44ch] leading-[1.75] mb-4">
          別タブで 3D ウォークスルーを開きます
        </p>

        <a
          href={fullViewerUrl}
          target="_blank"
          rel="noopener"
          onClick={() => { trackOpen(); }}
          className="inline-flex items-center gap-2 px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition bg-black/50 backdrop-blur-sm"
        >
          3Dビューアーを開く ↗
        </a>
      </div>
    </div>
  );
}
