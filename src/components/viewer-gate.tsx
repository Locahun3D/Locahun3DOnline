"use client";

import Link from "next/link";
import { buildViewerUrl, proxySplatUrl } from "@/lib/viewer";
import { useLocale, useHref } from "@/components/locale-provider";
import { tokenCostLabel } from "@/lib/schemas";

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
  const en = useLocale() === "en";
  const lh = useHref();
  const devBypass = process.env.NODE_ENV !== "production";
  const effectiveSubscription = hasSubscription || devBypass || freeAccess;

  const proxied = proxySplatUrl(splatUrl);
  const fullViewerUrl = buildViewerUrl(proxied, { protected: true });

  /* --- Paywall (no subscription) --- */
  if (!effectiveSubscription) {
    return (
      <div className="group relative aspect-video w-full border border-line overflow-hidden">
        {previewVideoUrl ? (
          <video
            src={previewVideoUrl}
            autoPlay loop muted playsInline
            className="absolute inset-0 w-full h-full object-cover"
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
        {/* ゲート文言はホバー時のみフェードイン表示。通常はプレビューを見せる。 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 backdrop-blur-md bg-black/70 opacity-0 pointer-events-none transition-opacity duration-300 group-hover:opacity-100 group-hover:pointer-events-auto">
          <div className="mono text-[11px] font-semibold tracking-[0.3em] uppercase text-accent mb-4 drop-shadow">
            {en
              ? `● Subscriber only · ${tokenCost} token(s)`
              : `● Subscriber only · ${tokenCost} トークン消費`}
          </div>
          <div className="serif text-2xl md:text-3xl font-bold leading-[1.5] max-w-[26ch] mb-4 text-white drop-shadow-lg">
            {en ? (
              <>
                The 3DGS walkthrough
                <br />
                is members only.
              </>
            ) : (
              <>
                3DGS ウォークスルーは
                <br />
                メンバー限定です。
              </>
            )}
          </div>
          <div className="text-[13px] text-white/85 mb-5">
            {en ? (
              <>
                This studio ({tokenCostLabel(tokenCost, "en")}) costs{" "}
                <span className="text-accent font-bold">{tokenCost} token(s)</span> / view
              </>
            ) : (
              <>
                このスタジオ（{tokenCostLabel(tokenCost, "ja")}）は{" "}
                <span className="text-accent font-bold">{tokenCost} トークン</span>
                {" "}消費 / 視聴
              </>
            )}
          </div>
          <p className="text-[14px] text-white/80 max-w-[42ch] leading-[1.9] mb-7">
            {en
              ? "Walk the real space in 3D and check lens angles, ceiling distance and light positions from your browser alone."
              : "実空間を 3D で歩き回り、レンズ画角・天井距離・光源位置をブラウザだけで検証できます。"}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href={lh(`/pricing?from=${propertyId}`)}
              className="px-7 py-3.5 text-[14px] font-bold rounded-md bg-accent text-white hover:bg-accent/85 transition shadow-lg"
            >
              {en ? "See plans" : "プランを見る"}
            </Link>
            {/* サインイン済みの非会員には Sign in を出さない（プラン加入へ誘導）。 */}
            {!signedIn && (
              <Link
                href={lh(`/sign-in?redirect=/properties/${propertyId}`)}
                className="px-7 py-3.5 text-[14px] font-semibold rounded-md border border-white/50 text-white hover:bg-white/10 transition"
              >
                {en ? "Already a member? Sign in" : "既にメンバーの方はサインイン"}
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

  /**
   * 視聴を開く。署名URLが使える場合は R2 直取得URL でビューアーを開き、
   * Worker CPU を消費しない。署名未設定/失敗時は従来の Worker 経由にフォールバック。
   * ポップアップブロック回避のため、クリック同期で空タブを開いてから URL を流し込む。
   */
  const openViewer = async (e: React.MouseEvent) => {
    e.preventDefault();
    trackOpen();
    const win = window.open("", "_blank");
    const fallback = () => {
      if (win) win.location.href = fullViewerUrl;
      else window.open(fullViewerUrl, "_blank");
    };
    // R2 ホストの相対アセットのみ署名対象（外部URLは従来どおり）。
    if (/^https?:\/\//.test(splatUrl)) {
      fallback();
      return;
    }
    try {
      const res = await fetch(
        `/api/viewer-asset?key=${encodeURIComponent(splatUrl)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return fallback();
      const data = (await res.json()) as { url?: string };
      if (!data.url) return fallback();
      const target = buildViewerUrl(data.url, { protected: true });
      if (win) win.location.href = target;
      else window.open(target, "_blank");
    } catch {
      fallback();
    }
  };

  /* --- Always open in new tab --- */
  return (
    <div className="relative aspect-video w-full border border-line overflow-hidden bg-[#141414]">
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
        <div className="flex flex-col items-center gap-2.5 px-6 py-4 border border-accent/70 bg-black/80 backdrop-blur-md">
          <div
            className={`mono text-[11px] font-bold tracking-[0.32em] uppercase ${
              freeAccess ? "text-green-400" : "text-accent"
            }`}
          >
            {freeAccess
              ? en ? "● Free period · no tokens used" : "● 限定無料期間中 · トークン消費なし"
              : `● ${sizeMb} MB`}
          </div>

          <p className="text-[12px] font-semibold text-white max-w-[44ch] leading-[1.75]">
            {en ? "Opens the 3D walkthrough in a new tab" : "別タブで 3D ウォークスルーを開きます"}
          </p>

          <a
            href={fullViewerUrl}
            target="_blank"
            rel="noopener"
            onClick={openViewer}
            className="inline-flex items-center gap-2 px-6 py-3 mono text-[11px] font-bold tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            {en ? "Open 3D viewer ↗" : "3Dビューアーを開く ↗"}
          </a>
        </div>
      </div>
    </div>
  );
}
