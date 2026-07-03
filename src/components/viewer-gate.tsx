"use client";

import Link from "next/link";
import { useState } from "react";
import { buildViewerUrl, proxySplatUrl } from "@/lib/viewer";
import { useLocale, useHref } from "@/components/locale-provider";

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
  /** 既にこのシーンをアンロック済み（2年以内）なら無償再視聴。 */
  alreadyUnlocked?: boolean;
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
  alreadyUnlocked = false,
}: Props) {
  const en = useLocale() === "en";
  const lh = useHref();
  const [tokenError, setTokenError] = useState<
    { tokenBalance: number; bonusTokens: number; tokenCost: number } | null
  >(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const devBypass = process.env.NODE_ENV !== "production";
  const effectiveSubscription = hasSubscription || devBypass || freeAccess;

  const proxied = proxySplatUrl(splatUrl);
  const fullViewerUrl = buildViewerUrl(proxied, { protected: true });

  /* --- Paywall (signed out) --- */
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
        {/* タップ/クリックで登録ポップアップを開く（ホバー非依存＝モバイルでも機能する）。 */}
        <button
          type="button"
          onClick={() => setShowAuthModal(true)}
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-center px-6 cursor-pointer backdrop-blur-md bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        >
          <div className="mono text-[11px] font-semibold tracking-[0.3em] uppercase text-accent mb-4 drop-shadow">
            {en
              ? `● Free account required · ${tokenCost} token(s)`
              : `● 無料登録が必要 · ${tokenCost} トークン消費`}
          </div>
          <div className="serif text-2xl md:text-3xl font-bold leading-[1.5] max-w-[26ch] text-white drop-shadow-lg">
            {en ? (
              <>
                Create a free account
                <br />
                to unlock the 3DGS walkthrough.
              </>
            ) : (
              <>
                無料アカウント登録で
                <br />
                3DGS ウォークスルーが見られます。
              </>
            )}
          </div>
        </button>

        {showAuthModal && (
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowAuthModal(false)}
          >
            <div
              className="bg-[#1a1a1a] border border-accent/60 max-w-sm w-full p-7 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-end -mt-2 -mr-2 mb-1">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="text-muted hover:text-ink text-lg leading-none p-2"
                  aria-label={en ? "Close" : "閉じる"}
                >
                  ✕
                </button>
              </div>
              <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-3">
                {en ? "ACCOUNT REGISTRATION" : "アカウント登録"}
              </div>
              <h3 className="serif text-xl font-bold mb-3 text-white">
                {en ? "A free account is required" : "無料アカウント登録が必要です"}
              </h3>
              <p className="text-[13px] text-white/70 leading-[1.85] mb-6">
                {en ? (
                  <>
                    Sign up free and get tokens instantly — even the Free plan can unlock and
                    walk this space in 3D.
                  </>
                ) : (
                  <>
                    無料登録するとトークンがすぐに付与され、Free プランでもこの空間を 3D で歩き回れます。
                  </>
                )}
              </p>
              <div className="flex flex-col gap-2.5">
                <Link
                  href={lh("/sign-up")}
                  className="px-6 py-3 text-[14px] font-bold rounded-md bg-accent text-white hover:bg-accent/85 transition"
                >
                  {en ? "Create free account" : "無料で登録する"}
                </Link>
                <Link
                  href={lh(`/sign-in?redirect=/properties/${propertyId}`)}
                  className="px-6 py-2.5 text-[13px] font-semibold text-white/70 hover:text-white transition"
                >
                  {en ? "Already a member? Sign in" : "すでに会員の方はサインイン"}
                </Link>
              </div>
            </div>
          </div>
        )}
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
    setTokenError(null);
    trackOpen();
    const win = window.open("", "_blank");
    const closeWin = () => {
      // トークン不足で開かない場合、先に開いた空タブは閉じる。
      try { win?.close(); } catch { /* ignore */ }
    };
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
      // 402 = トークン不足。ここで fallback すると /api/viewer-stream 経由で
      // トークン未チェックのまま視聴できてしまい機能が骨抜きになる。だから
      // 402 は絶対にフォールバックさせず、明確なエラーをユーザーに提示する。
      if (res.status === 402) {
        closeWin();
        let info: { tokenBalance: number; bonusTokens: number; tokenCost: number } =
          { tokenBalance: 0, bonusTokens: 0, tokenCost };
        try {
          const j = (await res.json()) as {
            tokenBalance?: number;
            bonusTokens?: number;
            tokenCost?: number;
          };
          info = {
            tokenBalance: j.tokenBalance ?? 0,
            bonusTokens: j.bonusTokens ?? 0,
            tokenCost: j.tokenCost ?? tokenCost,
          };
        } catch { /* keep defaults */ }
        setTokenError(info);
        return;
      }
      // その他の非200（503 署名未設定 / ネットワーク不良等）のみ従来フォールバック。
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
        <div className="flex flex-col items-center gap-2.5 px-6 py-4 border border-accent/70 bg-white/95 backdrop-blur-md shadow-lg">
          <div
            className={`mono text-[11px] font-bold tracking-[0.32em] uppercase ${
              freeAccess || alreadyUnlocked ? "text-green-600" : "text-accent"
            }`}
          >
            {freeAccess
              ? en ? "● Free period · no tokens used" : "● 限定無料期間中 · トークン消費なし"
              : alreadyUnlocked
                ? en ? "● Unlocked · free re-view" : "● 視聴済み · 無料で再視聴"
                : en
                  ? `● ${tokenCost} token${tokenCost > 1 ? "s" : ""}`
                  : `● ${tokenCost} トークン消費`}
          </div>

          {!alreadyUnlocked && (
            <p className="text-[12px] font-semibold text-ink/85 max-w-[44ch] leading-[1.75]">
              {en
                ? "Opens the 3D walkthrough in a new tab"
                : "別タブで 3D ウォークスルーを開きます"}
            </p>
          )}

          <a
            href={fullViewerUrl}
            target="_blank"
            rel="noopener"
            onClick={openViewer}
            className="inline-flex items-center gap-2 px-6 py-3 mono text-[11px] font-bold tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-white transition"
          >
            {en ? "Open 3D viewer ↗" : "3Dビューアーを開く ↗"}
          </a>

          {/* トークン不足（サーバ 402）。フォールバックさせずここで明示する。 */}
          {tokenError && (
            <div className="mt-1 w-full max-w-[46ch] rounded-md border border-red-300 bg-red-50 px-4 py-3 text-left">
              <div className="text-[12px] font-bold text-red-700 mb-1">
                {en ? "Not enough tokens" : "トークンが足りません"}
              </div>
              <p className="text-[12px] text-red-800/90 leading-[1.7]">
                {en
                  ? `This scene needs ${tokenError.tokenCost} token${
                      tokenError.tokenCost > 1 ? "s" : ""
                    }, but you have ${tokenError.tokenBalance + tokenError.bonusTokens}.`
                  : `このシーンの視聴には ${tokenError.tokenCost} トークン必要ですが、残高は ${
                      tokenError.tokenBalance + tokenError.bonusTokens
                    } です。`}
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <Link
                  href={lh(`/pricing?from=${propertyId}`)}
                  className="px-3.5 py-1.5 text-[11px] font-bold rounded-sm bg-accent text-white hover:bg-accent/85 transition"
                >
                  {en ? "See plans" : "プランを見る"}
                </Link>
                <Link
                  href={lh("/account")}
                  className="px-3.5 py-1.5 text-[11px] font-semibold rounded-sm border border-red-300 text-red-700 hover:bg-red-100 transition"
                >
                  {en ? "My tokens" : "トークン残高"}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
