import Link from "next/link";
import type { PublicUser } from "@/lib/account-schema";
import { totalTokens, publicDisplayName } from "@/lib/account-schema";
import DisplayNameEditor from "@/components/account/display-name-editor";
import { PLAN_TOKEN_BUDGET } from "@/lib/schemas";
import type { Property } from "@/lib/schemas";
import type { ViewUnlock } from "@/lib/view-unlocks";
import { localizedHref, type Locale } from "@/lib/i18n/dictionaries";
import RedeemGift from "@/components/account/redeem-gift";
import NdaConsentModal from "@/components/account/nda-consent-modal";
import MarketingConsentToggle from "@/components/account/marketing-consent-toggle";
import NotificationList from "@/components/account/notification-list";
import { openBillingPortalAction } from "@/lib/subscribe-actions";
import type { Notification } from "@/lib/notifications";

type BoardTile = { name: string; count: number; cover?: string };

/**
 * マイページ本体。以前は「概要カード群（このコンポーネント）」＋
 * account/page.tsx 側の「DETAILS 詳細セクション」が同じ情報をほぼ丸ごと
 * 二重表示していた（トークン残・プラン・購入履歴・保存物件・NDA・ギフト
 * 引換が両方に存在）。実機フィードバック「重複内容が多く整理が終わって
 * いない」「閲覧履歴、一覧できない」を受けて統合: DETAILS 側は撤去し、
 * そちらにしか無かった情報（メール/所属の表示、閲覧履歴の全件一覧への
 * 導線、配信設定）をこちらに寄せた。
 */
export default function AccountDashboard({
  user,
  locale,
  boardTiles,
  totalBoardCount,
  lastUnlock,
  lastUnlockProperty,
  lastUnlockSceneLabel,
  unlockedCount,
  notifications = [],
  billing = null,
  nowIso,
}: {
  user: PublicUser;
  locale: Locale;
  boardTiles: BoardTile[];
  totalBoardCount: number;
  lastUnlock: ViewUnlock | null;
  lastUnlockProperty: Property | null;
  lastUnlockSceneLabel: string;
  /** 有効期限内（無償再視聴期間内）のアンロック総数。「閲覧履歴」カードの一覧導線に表示。 */
  unlockedCount: number;
  /** 問い合わせ返信等のアプリ内通知（新しい順）。 */
  notifications?: Notification[];
  /** Stripe から取得した実際の請求間隔と次回更新日。未契約・未設定・取得失敗は null
   *  （その場合は tokenRefillAt を次回更新の近似として表示する）。 */
  billing?: { interval: "monthly" | "annual"; periodEnd: string | null } | null;
  /** サーバー側で確定した「現在時刻」(ISO)。相対時刻・残日数計算に使う
   *  (レンダー中に Date.now() を直接呼ばないため、Server Component でも
   *  純粋関数のルールに沿わせる)。 */
  nowIso: string;
}) {
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  const now = new Date(nowIso).getTime();

  const shownName = publicDisplayName(user);
  const initials = (shownName || "?").trim().slice(0, 2).toUpperCase();
  const isAdmin = user.role === "admin";
  const ndaAccepted = !!user.ndaAcceptedAt;
  const joinedDate = (user.createdAt ?? "").slice(0, 10) || "—";

  // ── TOKENS ──
  const tokens = totalTokens(user);
  const resetNote: string[] = [];
  if (user.tokenRefillAt) {
    resetNote.push(
      en
        ? `Resets ${user.tokenRefillAt.slice(0, 10)}`
        : `${user.tokenRefillAt.slice(5, 7)}/${user.tokenRefillAt.slice(8, 10)} リセット`,
    );
  } else if (user.tokenExpiresAt && user.tokenBalance > 0) {
    resetNote.push(
      en
        ? `Expires ${user.tokenExpiresAt.slice(0, 10)}`
        : `${user.tokenExpiresAt.slice(0, 10)} 失効予定`,
    );
  }
  if (user.bonusTokens > 0) {
    resetNote.push(
      en
        ? `${user.bonusTokens} non-expiring contributor tokens`
        : `うち${user.bonusTokens}は失効しない貢献枠`,
    );
  }

  // ── PLAN ──
  const planFree = user.plan === "free";
  const planName = planFree ? (en ? "Free" : "無料プラン") : user.plan.toUpperCase();
  const planBudget = PLAN_TOKEN_BUDGET[user.plan];
  const invoiceAutoSend = !planFree; // 有料プランは全て毎月請求書自動送付（pricing 表と一致）

  return (
    <div className="space-y-6 mb-10">
      {/* ── ユーザーヘッダー ── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-14 h-14 shrink-0 grid place-items-center bg-[#1ea0c4] text-white text-[18px] font-bold">
          {initials}
        </div>
        <div className="min-w-0">
          <DisplayNameEditor initialName={shownName} en={en} />
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {isAdmin && (
              <span className="mono text-[10px] tracking-[0.14em] uppercase border border-[#e2e7ec] px-1.5 py-0.5">
                {en ? "Admin" : "管理者"}
              </span>
            )}
            {ndaAccepted && (
              <span className="mono text-[10px] tracking-[0.14em] uppercase px-1.5 py-0.5 bg-[#e8f6ee] text-[#2c6e44]">
                {en ? "✓ NDA signed" : "✓ NDA 締結済"}
              </span>
            )}
            <span className="mono text-[10px] tracking-[0.14em] uppercase border border-[#e2e7ec] text-[#7b8794] px-1.5 py-0.5">
              {en ? `Joined ${joinedDate}` : `登録日 ${joinedDate}`}
            </span>
          </div>
          <div className="mono text-[11px] text-[#7b8794] mt-1.5">
            {user.email}
            {user.company && <span className="ml-2">・{user.company}</span>}
          </div>
        </div>
      </div>

      <NotificationList notifications={notifications} en={en} lh={lh} />

      {/* ── 上段: ステータス3枚 ── */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* TOKENS */}
        <div className="bg-white border border-[#e2e7ec] p-5">
          <div className="mono text-[10px] tracking-[0.24em] uppercase text-[#7b8794] mb-2">
            {en ? "Tokens" : "トークン"}
          </div>
          <div className="text-3xl font-bold text-[#1ea0c4]">{tokens}</div>
          {resetNote.length > 0 && (
            <div className="mono text-[11px] text-[#7b8794] mt-2 leading-[1.7]">
              {resetNote.join(en ? " · " : "・")}
            </div>
          )}
        </div>

        {/* PLAN */}
        <div className="bg-white border border-[#e2e7ec] p-5 flex flex-col">
          <div className="mono text-[10px] tracking-[0.24em] uppercase text-[#7b8794] mb-2">
            {en ? "Plan" : "プラン"}
          </div>
          <div className="text-2xl font-bold">
            {planName}
            {!planFree && (
              <span className="text-[12px] font-normal text-[#7b8794] ml-2">
                {billing
                  ? billing.interval === "annual"
                    ? en
                      ? "(annual)"
                      : "（年払い）"
                    : en
                      ? "(monthly)"
                      : "（月払い）"
                  : en
                    ? "(subscription)"
                    : ""}
              </span>
            )}
          </div>
          <div className="mono text-[11px] text-[#7b8794] mt-2 leading-[1.7]">
            {planFree
              ? en
                ? `Sign up bonus only — upgrade for ${planBudget || 16}+ tokens/mo`
                : "登録時ボーナスのみ・有料プランで毎月トークン付与"
              : (billing?.periodEnd ?? user.tokenRefillAt)
                ? en
                  ? `Next renewal ${(billing?.periodEnd ?? user.tokenRefillAt)!.slice(0, 10)}`
                  : `次回更新 ${(billing?.periodEnd ?? user.tokenRefillAt)!.slice(0, 10)}`
                : en
                  ? "Active subscription"
                  : "契約中"}
          </div>
          <Link
            href={lh("/pricing")}
            className="mono text-[10px] tracking-[0.2em] uppercase text-[#1ea0c4] hover:underline mt-auto pt-3"
          >
            {en ? "Change plan →" : "プラン変更 →"}
          </Link>
        </div>

        {/* 請求書・購入履歴 */}
        <div className="bg-white border border-[#e2e7ec] p-5 flex flex-col">
          <div className="mono text-[10px] tracking-[0.24em] uppercase text-[#7b8794] mb-2">
            {en ? "Invoices & purchases" : "請求書・購入履歴"}
          </div>
          <div className="flex items-center gap-3 mb-2">
            {/* CSS 描画のミニ書類プレビュー */}
            <div className="w-10 h-12 shrink-0 bg-white border border-[#e2e7ec] relative">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#1ea0c4]" />
              <div className="absolute left-1.5 right-1.5 top-3 h-[2px] bg-[#e2e7ec]" />
              <div className="absolute left-1.5 right-1.5 top-5 h-[2px] bg-[#e2e7ec]" />
              <div className="absolute left-1.5 right-3 top-7 h-[2px] bg-[#e2e7ec]" />
              <div className="absolute bottom-1 right-1.5 text-[8px] font-bold text-[#7b8794]">
                ¥
              </div>
            </div>
            <div className="text-[11px] text-[#7b8794] leading-[1.7]">
              <div>
                {en ? "Auto-send" : "自動送付"}{" "}
                <span className={invoiceAutoSend ? "text-[#3f9d5f] font-bold" : "text-[#7b8794]"}>
                  {invoiceAutoSend ? "ON" : "OFF"}
                </span>
              </div>
              {user.updatedAt && (
                <div>
                  {en ? "Latest " : "最新 "}
                  {(user.updatedAt ?? "").slice(0, 10)}
                </div>
              )}
            </div>
          </div>
          <Link
            href={lh("/dashboard/purchases")}
            className="mono text-[10px] tracking-[0.2em] uppercase text-[#1ea0c4] hover:underline mt-auto pt-1"
          >
            {en ? "View list →" : "一覧を見る →"}
          </Link>
        </div>
      </div>

      {/* ── 中段: 保存した物件 / 閲覧履歴 ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* 保存した物件 */}
        <div className="bg-white border border-[#e2e7ec] p-5 flex flex-col">
          <div className="mono text-[10px] tracking-[0.24em] uppercase text-[#7b8794] mb-3">
            {en ? "Saved properties" : "保存した物件"}
          </div>
          {boardTiles.length > 0 ? (
            <div className="grid grid-cols-3 gap-2.5 mb-3">
              {boardTiles.slice(0, 3).map((t, i) => (
                <div key={i} className="relative pt-[16px]">
                  <span className="absolute top-0 left-0 z-10 h-[16px] max-w-[90%] flex items-center px-1.5 text-[9px] font-bold truncate bg-[#eef2f5] text-[#14181c]/70 [clip-path:polygon(0_0,85%_0,100%_100%,0_100%)]">
                    {t.name}
                  </span>
                  <div className="border border-[#e2e7ec] p-1">
                    <div className="relative aspect-[16/10] bg-[#eef2f5] overflow-hidden">
                      {t.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.cover} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center mono text-[8px] opacity-40">
                          {en ? "empty" : "空"}
                        </div>
                      )}
                      <span className="absolute bottom-1 right-1 mono text-[8px] leading-[13px] text-white bg-black/55 px-1">
                        {t.count}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#f6f8fa] p-8 text-center mb-3">
              <p className="text-[12px] text-[#7b8794]">
                {en ? "No saved properties yet." : "まだ保存した物件はありません。"}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between mt-auto pt-1">
            <span className="mono text-[10px] text-[#7b8794]">
              {en
                ? `Saved ${user.bookmarks.length} · Boards ${totalBoardCount}`
                : `保存した物件 ${user.bookmarks.length}件・ボード${totalBoardCount}`}
            </span>
            <Link
              href={lh("/dashboard/bookmarks")}
              className="mono text-[10px] tracking-[0.2em] uppercase text-[#1ea0c4] hover:underline"
            >
              {en ? "Organize →" : "整理する →"}
            </Link>
          </div>
        </div>

        {/* 閲覧履歴 */}
        <div className="bg-white border border-[#e2e7ec] p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="mono text-[10px] tracking-[0.24em] uppercase text-[#7b8794]">
              {en ? "Browsing history" : "閲覧履歴"}
            </div>
            {/* 直近1件のプレビューだけでは全件一覧に辿り着けなかった
                （実機フィードバック「閲覧履歴、一覧できない」）ため、状態に
                関わらず常に /dashboard/unlocked への導線を出す。 */}
            <Link
              href={lh("/dashboard/unlocked")}
              className="mono text-[10px] tracking-[0.2em] uppercase text-[#1ea0c4] hover:underline shrink-0"
            >
              {en ? `All (${unlockedCount}) →` : `全${unlockedCount}件 →`}
            </Link>
          </div>
          {lastUnlock && lastUnlockProperty ? (
            <>
              <div className="relative aspect-video overflow-hidden mb-3">
                {lastUnlockProperty.cover?.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={lastUnlockProperty.cover.src}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[#eef2f5]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute top-2 right-2 mono text-[9px] tracking-[0.1em] text-white/90 bg-black/40 px-1.5 py-0.5">
                  {relativeTime(lastUnlock.unlockedAt, now, en)}
                </div>
                <div className="absolute bottom-2 left-2.5 text-white text-[13px] font-bold">
                  {en ? "Recently walked scene" : "最近歩いたシーン"}
                </div>
              </div>
              <div className="flex items-center justify-between mt-auto pt-1">
                <span className="mono text-[10px] text-[#7b8794] truncate pr-2">
                  {en
                    ? `${lastUnlockProperty.title}${lastUnlockSceneLabel ? ` (${lastUnlockSceneLabel})` : ""} · re-view ${daysRemainingLabel(lastUnlock.expiresAt, now, en)}`
                    : `閲覧履歴 ${lastUnlockProperty.title}${lastUnlockSceneLabel ? `（${lastUnlockSceneLabel}）` : ""}・無償再視聴 ${daysRemainingLabel(lastUnlock.expiresAt, now, en)}`}
                </span>
                <Link
                  href={lh(`/properties/${lastUnlockProperty.id}`)}
                  className="mono text-[10px] tracking-[0.2em] uppercase text-[#1ea0c4] hover:underline shrink-0"
                >
                  {en ? "Revisit →" : "再訪 →"}
                </Link>
              </div>
            </>
          ) : (
            <div className="bg-[#f6f8fa] p-8 text-center flex-1 flex flex-col items-center justify-center gap-3">
              <p className="text-[12px] text-[#7b8794]">
                {en ? "No walked scenes yet." : "まだ歩いたシーンがありません"}
              </p>
              <Link
                href={lh("/properties")}
                className="mono text-[10px] tracking-[0.2em] uppercase text-[#1ea0c4] hover:underline"
              >
                {en ? "Browse properties →" : "物件を探す →"}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── 下段: NDA / ギフトコード ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* NDA */}
        <div className="bg-white border border-[#e2e7ec] p-5">
          <div className="mono text-[10px] tracking-[0.24em] uppercase text-[#7b8794] mb-3">
            NDA
          </div>
          {ndaAccepted ? (
            <div className="flex items-start gap-3">
              <div className="w-10 h-12 shrink-0 bg-white border border-[#e2e7ec] relative">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#3f9d5f]" />
                <div className="absolute left-1.5 right-1.5 top-3 h-[2px] bg-[#e2e7ec]" />
                <div className="absolute left-1.5 right-1.5 top-5 h-[2px] bg-[#e2e7ec]" />
                <div className="absolute inset-0 grid place-items-center">
                  <span className="text-[#3f9d5f] text-lg leading-none">✓</span>
                </div>
              </div>
              <div>
                <div className="text-[13px] font-bold text-[#3f9d5f]">
                  {en
                    ? "NDA — non-disclosure agreement signed"
                    : "NDA — 秘密保持契約 締結済"}
                </div>
                <div className="mono text-[11px] text-[#7b8794] mt-1 leading-[1.7]">
                  {en
                    ? `Signed ${(user.ndaAcceptedAt ?? "").slice(0, 10)} — you can view all confidential locations and NDA-only scenes.`
                    : `${(user.ndaAcceptedAt ?? "").slice(0, 10)} 締結・機密ロケ地・NDA限定シーンをすべて閲覧できます。`}
                </div>
              </div>
            </div>
          ) : user.role === "production" ? (
            <div className="bg-[#fdf3e0] text-[#8a5f10] p-4">
              <p className="text-[12px] leading-[1.8] mb-3">
                {en
                  ? "NDA not signed / Confidential locations and NDA-only scenes are hidden."
                  : "NDA 未締結 / 機密ロケ地・NDA限定シーンは非表示です。"}
              </p>
              <NdaConsentModal />
            </div>
          ) : (
            <div className="bg-[#fdf3e0] text-[#8a5f10] p-4">
              <p className="text-[12px] leading-[1.8] mb-3">
                {en
                  ? "NDA / restricted-scene viewing is limited to Production accounts."
                  : "NDA・制限あり閲覧は「制作会社」アカウント限定です。"}
              </p>
              {user.status === "pending" ? (
                <span className="mono text-[10px] tracking-[0.2em] uppercase border border-[#8a5f10] px-3 py-1.5 inline-block">
                  {en ? "Application under review" : "審査中です"}
                </span>
              ) : (
                <Link
                  href={lh("/account/upgrade")}
                  className="mono text-[10px] tracking-[0.2em] uppercase border border-[#8a5f10] text-[#8a5f10] px-4 py-2 hover:bg-[#8a5f10] hover:text-white transition inline-block"
                >
                  {en ? "Apply for a Production account →" : "制作会社アカウントを申請 →"}
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ギフトコード（RedeemGift 自体が border/padding 込みのカード） */}
        <RedeemGift />
      </div>

      <MarketingConsentToggle initialConsent={user.marketingConsent} en={en} />

      {user.stripeCustomerId && (
        <div className="text-right">
          <form action={openBillingPortalAction}>
            <button className="mono text-[10px] tracking-[0.22em] uppercase text-[#7b8794] hover:text-[#1ea0c4] transition">
              {en ? "Billing portal (payment / cancel) →" : "支払い・解約はこちら →"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string, nowMs: number, en: boolean): string {
  const diffMs = nowMs - new Date(iso).getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 60) return en ? `${diffMin}m ago` : `${diffMin}分前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return en ? `${diffH}h ago` : `${diffH}時間前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return en ? `${diffD}d ago` : `${diffD}日前`;
  const diffMo = Math.floor(diffD / 30);
  return en ? `${diffMo}mo ago` : `${diffMo}ヶ月前`;
}

function daysRemainingLabel(expiresAtIso: string, nowMs: number, en: boolean): string {
  const diffMs = new Date(expiresAtIso).getTime() - nowMs;
  const days = Math.ceil(diffMs / 86400000);
  if (days <= 0) return en ? "expired" : "期限切れ";
  return en ? `${days}d left` : `あと${days}日`;
}
