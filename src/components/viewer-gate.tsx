"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const SplatViewer = dynamic(() => import("./splat-viewer"), {
  ssr: false,
  loading: () => (
    <div className="aspect-video bg-[#222] flex items-center justify-center">
      <div className="mono text-[11px] tracking-[0.3em] uppercase opacity-50 animate-pulse">
        Loading viewer…
      </div>
    </div>
  ),
});

interface Props {
  splatUrl: string;
  propertyId: string;
  /** Token consumed per single walkthrough open. 1 = house, 2 = medium, 3 = dome. */
  tokenCost?: 1 | 2 | 3;
  /** TODO: replace with real subscription check via Clerk publicMetadata */
  hasSubscription?: boolean;
}

const SIZE_LABEL: Record<1 | 2 | 3, string> = {
  1: "ハウス / 小規模",
  2: "中規模スタジオ",
  3: "ドーム / 大規模",
};

export default function ViewerGate({
  splatUrl,
  propertyId,
  tokenCost = 1,
  hasSubscription = false,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);

  // Dev / preview bypass: Clerk isn't wired yet, so we use the same
  // ADMIN_BYPASS flag that gates /admin to also unlock the viewer for testing.
  // When Clerk lands, replace this with the real subscription check from
  // useAuth() / publicMetadata.
  const devBypass =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ADMIN_BYPASS === "1";
  const effectiveSubscription = hasSubscription || devBypass;

  if (!effectiveSubscription) {
    return (
      <div className="relative aspect-video border border-line overflow-hidden">
        {/* Blurred placeholder preview */}
        <div
          className="absolute inset-0 bg-[#222]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, rgba(255,180,84,.18) 0%, transparent 60%), radial-gradient(circle at 30% 70%, rgba(255,255,255,.06) 0%, transparent 50%)",
            filter: "blur(1px)",
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 backdrop-blur-sm bg-black/40">
          <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-4">
            ● Subscriber only · {tokenCost} トークン消費
          </div>
          <div className="serif text-2xl md:text-3xl font-light leading-[1.5] max-w-[26ch] mb-4">
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

  if (!confirmed) {
    return (
      <div className="relative aspect-video border border-line overflow-hidden bg-[#222] flex flex-col items-center justify-center text-center px-6">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-60 mb-3">
          ⚠ DATA WARNING · {tokenCost} トークン消費
        </div>
        <div className="serif text-xl mb-3 max-w-[32ch]">
          このウォークスルーは大容量の 3DGS データを読み込みます。
        </div>
        <p className="text-[13px] text-muted max-w-[42ch] leading-[1.85] mb-2">
          Wi-Fi 接続を推奨します。モバイル回線では通信量にご注意ください。
        </p>
        <p className="text-[11px] text-muted max-w-[42ch] leading-[1.7] mb-6">
          開くと今月のトークン残数から{" "}
          <span className="text-accent">{tokenCost} トークン</span>{" "}
          消費します ({SIZE_LABEL[tokenCost]})。
          同じ物件の再訪は追加消費なし。
        </p>
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
        >
          {tokenCost} トークン使ってビューアーを開く →
        </button>
      </div>
    );
  }

  return <SplatViewer src={splatUrl} />;
}
