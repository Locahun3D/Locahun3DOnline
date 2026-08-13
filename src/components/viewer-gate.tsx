"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buildViewerUrl, proxySplatUrl } from "@/lib/viewer";
import { useLocale, useHref } from "@/components/locale-provider";
import { TOKEN_PACK } from "@/lib/schemas";
import { buyTokenPackAction } from "@/lib/token-pack-actions";

/**
 * 1物件に複数シーンがあると ViewerGate が並ぶ分だけ自動再生プレビュー動画も
 * 並び、初期表示だけで全動画を同時ダウンロード/デコードしてページが重くなる。
 * IntersectionObserver で画面付近に入るまで <video> 自体をマウントしない。
 */
function LazyPreviewVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className="absolute inset-0 w-full h-full">
      {visible && (
        <video src={src} autoPlay loop muted playsInline className={className} />
      )}
    </div>
  );
}

interface Props {
  splatUrl: string;
  propertyId: string;
  label: string;
  sizeMb: number;
  previewVideoUrl?: string;
  tokenCost?: 1 | 2 | 3 | 5;
  hasSubscription?: boolean;
  freeAccess?: boolean;
  /** 現在未使用。呼び出し側が渡しているため型は残す（外すと呼び出し側が壊れる）。 */
  signedIn?: boolean;
  /** 先方スタジオ共有用の限定プレビュートークン。あればログイン/課金なしで視聴可
   *  （/api/viewer-asset にトークンを渡し、サーバ側で検証して署名URLを発行）。 */
  previewToken?: string;
  /** 掲載者サイトへの埋め込み用トークン。previewToken と同じくゲートを外すが、
   *  期限がなく掲載者が停止できる（DECISION_LOG D-008 のホスティング商品）。 */
  embedToken?: string;
  /** 既にこのシーンをアンロック済み（1年以内）なら無償再視聴。 */
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
  previewToken,
  embedToken,
  alreadyUnlocked = false,
}: Props) {
  const en = useLocale() === "en";
  const lh = useHref();
  const [tokenError, setTokenError] = useState<
    {
      tokenBalance: number;
      purchasedTokens: number;
      bonusTokens: number;
      tokenCost: number;
    } | null
  >(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  // 500MB超のシーンをタッチ端末（スマホ/タブレット）で開こうとした時の事前警告。
  // 幅ではなく pointer:coarse で判定する（PCのウィンドウを狭くしただけの誤爆を防ぐ）。
  // 「続行する」を押した後の再クリックは popup-blocker 回避のため必要
  // （window.open は必ずユーザー操作イベントの同期内で呼ぶ必要がある）。
  const [showSizeWarning, setShowSizeWarning] = useState(false);
  const LARGE_SCENE_MB = 500;
  const devBypass = process.env.NODE_ENV !== "production";
  // 共有プレビュートークンがあれば課金ゲートを外す（サーバ側で検証）。
  const effectiveSubscription =
    hasSubscription || devBypass || freeAccess || !!previewToken || !!embedToken;

  const proxied = proxySplatUrl(splatUrl);
  const fullViewerUrl = buildViewerUrl(proxied, { protected: true });

  /* --- Paywall (signed out) --- */
  if (!effectiveSubscription) {
    return (
      <div className="group relative aspect-video w-full border border-line overflow-hidden">
        {previewVideoUrl ? (
          <LazyPreviewVideo src={previewVideoUrl} className="absolute inset-0 w-full h-full object-cover" />
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
        {/* タップ/クリックで登録ポップアップを開く（ホバー非依存＝モバイルでも機能する）。
            ⚠ 2026-08-13: 以前はここに
              ① アクセント色の「● 無料登録が必要 · N トークン消費」
              ② 大きなセリフ体の「無料アカウント登録で 3DGS ウォークスルーが見られます。」
            の2つが重なって出ており、しかもホバーするまで見えなかったため
            「トークンの表示があちこちにあって分かりにくい」と指摘された。
            → 「N トークンで見られます」の白文字 1 行だけに集約し、常時表示にした。 */}
        <button
          type="button"
          onClick={() => setShowAuthModal(true)}
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-3 text-center px-6 cursor-pointer bg-black/45 hover:bg-black/60 transition-colors duration-300"
        >
          <div className="text-[15px] md:text-[17px] font-bold text-white drop-shadow-lg">
            {en
              ? `Viewable with ${tokenCost} token${tokenCost > 1 ? "s" : ""}`
              : `${tokenCost} トークンで見られます`}
          </div>
          <span className="mono text-[10px] tracking-[0.24em] uppercase text-white/85 border border-white/60 px-4 py-2">
            {en ? "Sign up free" : "無料登録して見る"}
          </span>
        </button>

        {/* 登録モーダル — 「Free でできること比較型」。
            旧実装は暗色前提（bg-[#1a1a1a]＋text-white）のままライトテーマ化され、
            白地に白文字で本文が不可視になっていた（実機スクショで発覚）。
            ライトテーマのトークンで作り直し、左=Free プランのままできること、
            右=CTA の2カラムで「登録=課金が始まる」という警戒を解く。 */}
        {showAuthModal && (
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowAuthModal(false)}
          >
            <div
              className="relative bg-white border border-line shadow-2xl max-w-[560px] w-full grid sm:grid-cols-[1.2fr_1fr] text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="absolute top-1.5 right-2.5 text-muted hover:text-ink text-lg leading-none p-2 z-10"
                aria-label={en ? "Close" : "閉じる"}
              >
                ✕
              </button>

              {/* 左: Free プランのままできること */}
              <div className="px-7 py-6 sm:border-r border-b sm:border-b-0 border-line">
                <div className="mono text-[9.5px] tracking-[0.24em] uppercase text-accent mb-3">
                  {en ? "What the Free plan includes" : "FREE プランのままできること"}
                </div>
                <ul className="space-y-1.5 text-[13px] leading-[1.8] text-ink">
                  <li className="flex gap-2.5">
                    <span className="text-accent font-bold shrink-0">✓</span>
                    {en
                      ? "3DGS walkthroughs (6 tokens on signup)"
                      : "3DGS ウォークスルー視聴（6トークン付与）"}
                  </li>
                  <li className="flex gap-2.5">
                    <span className="text-accent font-bold shrink-0">✓</span>
                    {en
                      ? "Full catalog, photos & map search"
                      : "全物件のカタログ・写真・地図検索"}
                  </li>
                  <li className="flex gap-2.5">
                    <span className="text-accent font-bold shrink-0">✓</span>
                    {en ? "Reviews & location boards" : "レビュー・掲示板の閲覧"}
                  </li>
                  <li className="flex gap-2.5">
                    <span className="text-accent font-bold shrink-0">✓</span>
                    {en ? "Bookmarks (organized in boards)" : "ブックマーク保存（ボード整理）"}
                  </li>
                </ul>
                <p className="text-[10.5px] text-muted leading-[1.9] mt-4">
                  {en ? (
                    <>
                      No expiry. No credit card required.
                      <br />
                      Never auto-upgrades to a paid plan.
                    </>
                  ) : (
                    <>
                      期限なし・クレジットカード登録なし。
                      <br />
                      有料プランへの自動移行はありません。
                    </>
                  )}
                </p>
              </div>

              {/* 右: CTA */}
              <div className="px-6 py-7 flex flex-col justify-center text-center bg-[#fbfcfd]">
                <h3 className="text-[16px] font-bold leading-[1.6] mb-4 text-ink">
                  {en ? (
                    <>
                      Sign up free to
                      <br />
                      keep walking
                    </>
                  ) : (
                    <>
                      無料登録して
                      <br />
                      続きを歩く
                    </>
                  )}
                </h3>
                <Link
                  href={lh("/sign-up")}
                  className="px-6 py-3 text-[14px] font-bold bg-accent text-white hover:brightness-105 transition"
                >
                  {en ? "Create free account" : "無料で登録する"}
                </Link>
                <Link
                  href={lh(`/sign-in?redirect=/properties/${propertyId}`)}
                  className="mt-3 text-[12.5px] text-muted hover:text-ink transition"
                >
                  {en ? "Already a member? Sign in" : "サインインはこちら"}
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
   *
   * サイズ警告のチェックはここでは行わない（呼び出し側で判定）。「続行する」
   * ボタンから直接この関数を呼ぶ経路があり、setState 直後に同期で呼ぶと
   * sizeWarningAcked がまだ古い値のクロージャを見てしまい、警告が無限に
   * 再表示される（stale closure）。判定は openViewer 呼び出し前の一箇所に集約する。
   */
  const doOpenViewer = async (e: React.MouseEvent) => {
    e.preventDefault();
    setTokenError(null);
    // 共有プレビューは匿名アクセスなので閲覧計測は行わない（分析を汚さない）。
    if (!previewToken) trackOpen();
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
      const previewQs = previewToken
        ? `&preview=${encodeURIComponent(previewToken)}`
        : embedToken
          ? `&embed=${encodeURIComponent(embedToken)}`
          : "";
      const res = await fetch(
        `/api/viewer-asset?key=${encodeURIComponent(splatUrl)}${previewQs}`,
        { cache: "no-store" },
      );
      // 402 = トークン不足。ここで fallback すると /api/viewer-stream 経由で
      // トークン未チェックのまま視聴できてしまい機能が骨抜きになる。だから
      // 402 は絶対にフォールバックさせず、明確なエラーをユーザーに提示する。
      if (res.status === 402) {
        closeWin();
        let info: {
          tokenBalance: number;
          purchasedTokens: number;
          bonusTokens: number;
          tokenCost: number;
        } = { tokenBalance: 0, purchasedTokens: 0, bonusTokens: 0, tokenCost };
        try {
          const j = (await res.json()) as {
            tokenBalance?: number;
            purchasedTokens?: number;
            bonusTokens?: number;
            tokenCost?: number;
          };
          info = {
            tokenBalance: j.tokenBalance ?? 0,
            purchasedTokens: j.purchasedTokens ?? 0,
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

  /** 通常のクリック経路。大容量シーン×タッチ端末なら先に警告を出して止める。 */
  const openViewer = (e: React.MouseEvent) => {
    if (
      sizeMb >= LARGE_SCENE_MB &&
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches
    ) {
      e.preventDefault();
      setShowSizeWarning(true);
      return;
    }
    doOpenViewer(e);
  };

  /* --- Always open in new tab --- */
  return (
    <>
    <div className="relative aspect-video w-full border border-line overflow-hidden bg-[#141414]">
      {previewVideoUrl ? (
        <LazyPreviewVideo src={previewVideoUrl} className="absolute inset-0 w-full h-full object-cover" />
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
        {/* ⚠ 2026-08-13: 以前は w-full + bg-white/95 でカード幅いっぱいの
            不透明な白い箱になっており、背後のシーンが完全に隠れて
            「大きすぎて見えない」と指摘された。
            → w-full をやめてコンテンツ幅（上限 max-w）に縮め、左右の内側余白も
              詰め、背景を半透明にして背後が透けるようにした。
            （親は align-items:center なので w-full を外すと shrink-to-fit する） */}
        <div className="max-w-full flex flex-col items-center gap-2 px-3.5 py-2.5 border border-accent/70 bg-white/70 backdrop-blur-sm shadow-lg">
          <div
            className={`mono text-[11px] font-bold tracking-[0.32em] uppercase ${
              previewToken || freeAccess || alreadyUnlocked
                ? "text-green-600"
                : "text-accent"
            }`}
          >
            {previewToken
              ? en ? "● Shared preview · no tokens used" : "● 共有プレビュー · トークン消費なし"
              : embedToken
                ? en ? "● 3D tour · free to view" : "● 3Dツアー · 無料で閲覧できます"
              : freeAccess
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
        </div>
      </div>
    </div>

    {/* 大容量シーンの事前警告 / トークン不足は、カード内(aspect-video +
        overflow-hidden で高さ固定)に置くとスマホで警告の高さがカードを超え、
        上端が見切れる。だからカードの外の「画面中央 fixed モーダル」にして
        クリップから完全に逃がす（何度直しても再発していた見切れの根治）。 */}
    {showSizeWarning && (
      <div
        className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
        onClick={() => setShowSizeWarning(false)}
      >
        <div
          className="w-full max-w-[400px] rounded-md border border-amber-300 bg-amber-50 px-5 py-4 text-left shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[13px] font-bold text-amber-800 mb-1.5">
            {en ? "This scene is large" : "データ容量が大きいシーンです"}
          </div>
          <p className="text-[12.5px] text-amber-900/90 leading-[1.75]">
            {en
              ? `About ${sizeMb.toLocaleString()} MB. On phones and tablets this may load slowly, fail to render, or use a lot of mobile data. Viewing on a PC is recommended.`
              : `約 ${sizeMb.toLocaleString()} MB あります。スマートフォン・タブレットでは読み込みが遅い／描画できない／通信量を大きく消費する場合があります。PCでの閲覧を推奨します。`}
          </p>
          <div className="flex flex-wrap gap-2 mt-3.5">
            <button
              type="button"
              onClick={(ev) => {
                setShowSizeWarning(false);
                doOpenViewer(ev);
              }}
              className="px-4 py-2 text-[12px] font-bold rounded-sm bg-amber-600 text-white hover:bg-amber-700 transition"
            >
              {en ? "Continue anyway" : "それでも開く"}
            </button>
            <button
              type="button"
              onClick={() => setShowSizeWarning(false)}
              className="px-4 py-2 text-[12px] font-semibold rounded-sm border border-amber-300 text-amber-800 hover:bg-amber-100 transition"
            >
              {en ? "Cancel" : "閉じる"}
            </button>
          </div>
        </div>
      </div>
    )}

    {tokenError && (
      <div
        className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
        onClick={() => setTokenError(null)}
      >
        <div
          className="w-full max-w-[400px] rounded-md border border-red-300 bg-red-50 px-5 py-4 text-left shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[13px] font-bold text-red-700 mb-1.5">
            {en ? "Not enough tokens" : "トークンが足りません"}
          </div>
          <p className="text-[12.5px] text-red-800/90 leading-[1.75]">
            {en
              ? `This scene needs ${tokenError.tokenCost} token${
                  tokenError.tokenCost > 1 ? "s" : ""
                }, but you have ${
                  tokenError.tokenBalance +
                  tokenError.purchasedTokens +
                  tokenError.bonusTokens
                }.`
              : `このシーンの視聴には ${tokenError.tokenCost} トークン必要ですが、残高は ${
                  tokenError.tokenBalance +
                  tokenError.purchasedTokens +
                  tokenError.bonusTokens
                } です。`}
          </p>
          {/* トークン不足のこの瞬間が、追加購入の意思が最も高い地点。サブスク
              (月額)より先に、その場で解決できる単発購入を主導線として出す。 */}
          <form action={buyTokenPackAction} className="mt-3.5">
            <button
              type="submit"
              className="w-full px-4 py-2.5 text-[12.5px] font-bold rounded-sm bg-accent text-white hover:bg-accent/85 transition"
            >
              {en
                ? `Buy ${TOKEN_PACK.tokens} tokens — ¥${TOKEN_PACK.priceYen.toLocaleString()}`
                : `トークン${TOKEN_PACK.tokens}枚を購入 — ¥${TOKEN_PACK.priceYen.toLocaleString()}`}
            </button>
          </form>
          <div className="flex flex-wrap gap-2 mt-2">
            <Link
              href={lh(`/pricing?from=${propertyId}`)}
              className="px-4 py-2 text-[12px] font-semibold rounded-sm border border-red-300 text-red-700 hover:bg-red-100 transition"
            >
              {en ? "See plans" : "プランを見る"}
            </Link>
            <Link
              href={lh("/account")}
              className="px-4 py-2 text-[12px] font-semibold rounded-sm border border-red-300 text-red-700 hover:bg-red-100 transition"
            >
              {en ? "My tokens" : "トークン残高"}
            </Link>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
