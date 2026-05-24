"use client";

import { useState } from "react";
import Link from "next/link";

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
}: Props) {
  const [openedAt, setOpenedAt] = useState<number | null>(null);

  // Dev / preview bypass — replaced with Clerk publicMetadata check when wired.
  const devBypass =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ADMIN_BYPASS === "1";
  const effectiveSubscription = hasSubscription || devBypass;

  // Build the viewer URL once.
  const viewerUrl = splatUrl
    ? `/viewer/offline-viewer.html?autoload=${encodeURIComponent(splatUrl)}`
    : "/viewer/offline-viewer.html";

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

  // Subscribed: single-click "open in new tab" gate
  return (
    <div className="relative aspect-video border border-line overflow-hidden bg-[#141414]">
      {/* Background gradient hint */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at center, rgba(255,180,84,.10) 0%, transparent 65%), radial-gradient(circle at 30% 70%, rgba(255,255,255,.04) 0%, transparent 50%)",
        }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-3">
          ● 3DGS WALKTHROUGH READY
        </div>

        <div className="serif text-2xl md:text-3xl font-light leading-[1.4] max-w-[28ch] mb-3">
          {openedAt ? (
            <>別タブで開いています。</>
          ) : (
            <>別タブで全画面表示で開きます。</>
          )}
        </div>

        <div className="mono text-[10px] tracking-[0.22em] uppercase text-muted mb-2">
          このスタジオ ({SIZE_LABEL[tokenCost]}) は{" "}
          <span className="text-accent">{tokenCost} トークン</span>
          {" "}消費 / 視聴
        </div>

        <p className="text-[11px] text-muted max-w-[44ch] leading-[1.75] mb-6">
          {openedAt
            ? "新しいタブに切り替えてご利用ください。閉じてしまった場合は下のボタンで再度開けます (同じ物件の再訪はトークン追加消費なし)。"
            : "クリックすると新しいタブで 3DGS ビューアーが立ち上がります。タブを閉じてもこのページには戻れます。"}
        </p>

        <a
          href={viewerUrl}
          target="_blank"
          rel="noopener"
          onClick={() => setOpenedAt(Date.now())}
          className="inline-flex items-center gap-2 px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
        >
          {openedAt
            ? "もう一度開く ↗"
            : `${tokenCost} トークン使って別タブで開く ↗`}
        </a>

        {!openedAt && (
          <p className="mt-5 mono text-[9px] tracking-[0.22em] uppercase opacity-50">
            ⚠ 大容量 3DGS データ · Wi-Fi 推奨
          </p>
        )}
      </div>
    </div>
  );
}
