"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const SplatViewer = dynamic(() => import("./splat-viewer"), {
  ssr: false,
  loading: () => (
    <div className="aspect-video bg-[#070707] flex items-center justify-center">
      <div className="mono text-[11px] tracking-[0.3em] uppercase opacity-50 animate-pulse">
        Loading viewer…
      </div>
    </div>
  ),
});

interface Props {
  splatUrl: string;
  propertyId: string;
  /** TODO: replace with real subscription check via Clerk publicMetadata */
  hasSubscription?: boolean;
}

export default function ViewerGate({
  splatUrl,
  propertyId,
  hasSubscription = false,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);

  if (!hasSubscription) {
    return (
      <div className="relative aspect-video border border-line overflow-hidden">
        {/* Blurred placeholder preview */}
        <div
          className="absolute inset-0 bg-[#070707]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, rgba(255,180,84,.18) 0%, transparent 60%), radial-gradient(circle at 30% 70%, rgba(255,255,255,.06) 0%, transparent 50%)",
            filter: "blur(1px)",
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 backdrop-blur-sm bg-black/40">
          <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-4">
            ● Subscriber only
          </div>
          <div className="serif text-2xl md:text-3xl font-light leading-[1.5] max-w-[26ch] mb-6">
            3DGS ウォークスルーは
            <br />
            メンバー限定です。
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

  if (!confirmed) {
    return (
      <div className="relative aspect-video border border-line overflow-hidden bg-[#070707] flex flex-col items-center justify-center text-center px-6">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-60 mb-3">
          ⚠ DATA WARNING
        </div>
        <div className="serif text-xl mb-3 max-w-[32ch]">
          このウォークスルーは大容量の 3DGS データを読み込みます。
        </div>
        <p className="text-[13px] text-muted max-w-[42ch] leading-[1.85] mb-6">
          Wi-Fi 接続を推奨します。モバイル回線では通信量にご注意ください。
        </p>
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
        >
          ビューアーを開く →
        </button>
      </div>
    );
  }

  return <SplatViewer src={splatUrl} />;
}
