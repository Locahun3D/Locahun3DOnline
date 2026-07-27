import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/dal";
import { roleLabel } from "@/lib/account-schema";
import { listNotifications } from "@/lib/notifications";
import HeaderMark from "@/components/header-mark";
import CartLink from "@/components/cart-link";
import NotificationBell from "@/components/notification-bell";
import LangToggle from "@/components/lang-toggle";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref, translate, type DictKey } from "@/lib/i18n/dictionaries";

const NAV: { href: string; key: DictKey; code: string }[] = [
  { href: "/properties", key: "nav.properties", code: "0.1" },
  { href: "/pricing", key: "nav.pricing", code: "0.2" },
  { href: "/about", key: "nav.about", code: "0.3" },
  { href: "/contact", key: "nav.contact", code: "0.4" },
];

export default async function SiteHeader() {
  const user = await getCurrentUser();
  // 通知はこれまで /account に来ないと存在に気づけなかった。ヘッダーのベルで
  // 未読件数を常時見せ、押せばその場で最近の通知一覧をドロップダウン表示する
  // （マイページへ飛ばさずに読める）。集計・取得はサインイン時のみサーバー側。
  const notifications = user ? await listNotifications(user.id) : [];
  const unreadCount = notifications.filter((n) => !n.read).length;
  // ドロップダウンには最近分のみ渡す（全件はマイページの一覧で。payload を絞る）。
  const recentNotifications = notifications.slice(0, 12);
  const locale = await getLocale();
  const t = (k: DictKey) => translate(locale, k);
  const lh = (href: string) => localizedHref(href, locale);
  const scanUrl = locale === "en" ? "https://web.locahun3d.com/en/" : "https://web.locahun3d.com/";
  // EN版はブランド表記も英字に切り替える（マーク自体は共通）。
  const brandName = locale === "en" ? "Locahun3D" : "ロケハン3D";

  /**
   * PC/タブレット(768px+)は1行、モバイル(768px未満)は同じ要素を2段に折り返して
   * 縮小表示する（ハンバーガーには畳まない）。切替幅はスキャンサイトと同一の
   * 768px（Tailwind lg=1024px でも md=768px でもなく min-[768px]: で書くこと。
   * lg:/md: を混ぜると Tailwind の出力順で後勝ちし境界がズレる実害があった）。
   * ⚠ 以前は 1200px 切替だったが、html の zoom(<1200px=0.7) でレイアウト実効幅が
   * 820/0.7=1171px相当に広がる一方 @media は実寸で評価されるため、iPad で
   * 「中身は広いのにヘッダーだけ2段」＝2段目が丸ごと空白、という崩れが出ていた。
   * globals.css の 768–1199px 帯を zoom:0.8 にした上で切替も 768px へ下げてある
   * （どちらか片方だけ変えると再発する）。
   * 「PC/モバイルで見える要素を変えない、サイズ調整のみで揃える」という
   * 明示の指示に基づく（実測: 全要素を1行9pxに詰めても600px超で320-390px
   * 幅には物理的に収まらないため、2段構成で妥協）。
   */
  const authButtons = (
    <Show when="signed-out">
      {/* Modal mode: signing in does NOT push a /sign-in history entry,
          so the browser Back button never gets trapped bouncing through
          an already-authenticated /sign-in page. */}
      <SignInButton mode="modal">
        <button className="px-1 min-[768px]:px-3 min-[1200px]:px-4 py-0.5 min-[768px]:py-1 min-[1200px]:py-1.5 text-[7px] min-[360px]:text-[8px] min-[768px]:text-[11px] min-[1200px]:text-[12px] mono tracking-[0.02em] min-[768px]:tracking-[0.12em] min-[1200px]:tracking-[0.2em] uppercase border border-line text-ink hover:border-accent hover:text-accent transition whitespace-nowrap">
          {t("auth.login")}
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="px-1 min-[768px]:px-3 min-[1200px]:px-4 py-0.5 min-[768px]:py-1 min-[1200px]:py-1.5 text-[7px] min-[360px]:text-[8px] min-[768px]:text-[11px] min-[1200px]:text-[12px] mono tracking-[0.02em] min-[768px]:tracking-[0.12em] min-[1200px]:tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition whitespace-nowrap">
          {t("auth.signup")}
        </button>
      </SignUpButton>
    </Show>
  );

  const authSignedIn = (
    <Show when="signed-in">
      {user && (
        <Link
          href={lh("/account")}
          className="flex items-center gap-1 min-[768px]:gap-1.5 min-[1200px]:gap-2 text-[9px] min-[768px]:text-[11px] min-[1200px]:text-[12px] mono tracking-[0.05em] min-[768px]:tracking-[0.12em] min-[1200px]:tracking-[0.18em] uppercase text-muted hover:text-accent transition whitespace-nowrap"
        >
          {/* 権限バッジ（例「撮影スタジオ」）は 768–1023px では出さない。
              1行ヘッダー化したこの帯はサインイン時の右側が最も混み、実測で
              768px のナビ→ブランド間が -9px（＝重なり）になっていた。
              バッジを落とすと +51px の余裕が出る。1024px 以上は元どおり表示。
              ⚠ 範囲は max-[Npx] で排他にすること（sm: と min-[768px]: を
              同じプロパティで重ねると出力順で勝敗が不定になる）。 */}
          <span className="hidden sm:max-[768px]:inline min-[1024px]:inline border border-line px-1 min-[768px]:px-1.5 py-0.5 text-[8px] min-[768px]:text-[10px] min-[1200px]:text-[9px]">
            {roleLabel(user.role, locale)}
          </span>
          <span className="hidden min-[360px]:inline">{t("auth.mypage")}</span>
        </Link>
      )}
      {/* スタジオ(掲載者)の入口。これが無いと、掲載ページを作る権限はあるのに
          /admin/properties を直接URLで教えてもらう以外に辿り着けなかった。 */}
      {user?.role === "studio" && (
        <Link
          href={lh("/admin/properties")}
          className="hidden min-[1200px]:inline-block px-2 min-[1200px]:px-3 py-1 min-[1200px]:py-1.5 text-[9px] min-[1200px]:text-[10px] mono tracking-[0.14em] min-[1200px]:tracking-[0.22em] uppercase text-muted border-l border-line pl-2 min-[1200px]:pl-3 hover:text-accent transition whitespace-nowrap"
        >
          ⌂ {locale === "en" ? "Listings" : "掲載管理"}
        </Link>
      )}
      {/* 管理者リンクはPC専用（旧 mobile-nav.tsx から踏襲、モバイルは基本操作しないため非表示） */}
      {user?.role === "admin" && (
        <Link
          href={lh("/admin")}
          className="hidden min-[1200px]:inline-block px-2 min-[1200px]:px-3 py-1 min-[1200px]:py-1.5 text-[9px] min-[1200px]:text-[10px] mono tracking-[0.14em] min-[1200px]:tracking-[0.22em] uppercase text-muted border-l border-line pl-2 min-[1200px]:pl-3 hover:text-accent transition whitespace-nowrap"
        >
          ⚙ {t("auth.admin")}
        </Link>
      )}
      {user && (
        <NotificationBell notifications={recentNotifications} unreadCount={unreadCount} locale={locale} en={locale === "en"} />
      )}
      <UserButton appearance={{ elements: { avatarBox: "w-6 h-6 min-[768px]:w-7 min-[768px]:h-7" } }} />
    </Show>
  );

  // トグルの状態規則（スキャンサイトと共通）:
  // 各セルは常に自サービス色のボーダー50%、アクティブ側のみ bg12%+文字を
  // サービス色に。数値もスキャン側 @media(max-width:1199px) ブロックと1:1。
  const scanOnlineToggle = (
    <div className="flex items-stretch brand text-[7px] min-[360px]:text-[8px] min-[768px]:text-[10px] min-[1200px]:text-[11px] tracking-[0.02em] min-[768px]:tracking-[0.04em] min-[1200px]:tracking-[0.06em]">
      <a
        href={scanUrl}
        className="px-[3px] min-[360px]:px-1 min-[768px]:px-2 min-[1200px]:px-3 py-0.5 min-[768px]:py-1 border border-[#ffb454]/50 text-ink hover:bg-[#ffb454] hover:text-bg transition whitespace-nowrap"
      >
        {t("header.scan")}
      </a>
      <a
        href={lh("/properties")}
        className="px-[3px] min-[360px]:px-1 min-[768px]:px-2 min-[1200px]:px-3 py-0.5 min-[768px]:py-1 border border-l-0 border-[#5ec8e8]/50 text-[#5ec8e8] bg-[#5ec8e8]/12 hover:bg-[#5ec8e8] hover:text-bg transition whitespace-nowrap"
      >
        {t("header.online")}
      </a>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur-sm">
      {/* ══ PC/タブレット(768px+) — 1行 ══ */}
      <div className="hidden min-[768px]:flex frame items-center h-16 gap-3">
        <div className="flex items-center gap-4 xl:gap-7 flex-1 min-w-0">
          <nav className="flex items-center gap-4 min-[1440px]:gap-6">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={lh(n.href)}
                className="group flex items-center gap-1.5 text-[13px] font-light text-muted hover:text-ink transition-colors whitespace-nowrap"
              >
                <span className="hidden min-[1440px]:inline mono text-[10px] tracking-[0.2em] opacity-50 group-hover:text-accent group-hover:opacity-100 transition">
                  {n.code}
                </span>
                {t(n.key)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <Link href={lh("/")} aria-label={brandName} className="flex items-center gap-2.5">
            <HeaderMark />
            <span className="brand text-lg tracking-[0.01em] whitespace-nowrap">{brandName}</span>
          </Link>
          <div className="hidden xl:block ml-1">{scanOnlineToggle}</div>
          <LangToggle className="hidden 2xl:inline-block" />
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
          <LangToggle className="2xl:hidden" />
          <CartLink />
          {authButtons}
          {authSignedIn}
        </div>
      </div>

      {/* ══ モバイル(768px未満) — 2段。PCと同じ要素をサイズ調整して
          全て表示する（要素の非表示・ハンバーガー化はしない）。 ══ */}
      <div className="min-[768px]:hidden frame">
        {/* 1段目: ロゴ / スキャン・オンライン / EN / カート / 認証。
            768px以上（タブレット帯）はスマホ極小サイズのままだと余白だらけで
            崩れて見えるため、中間サイズへ拡大する（スキャンサイトと数値共通）。 */}
        <div className="flex items-center h-12 min-[768px]:h-14 gap-0.5 min-[360px]:gap-1 min-[768px]:gap-2">
          <Link href={lh("/")} aria-label={brandName} className="flex items-center gap-1 min-[768px]:gap-2 shrink-0">
            <HeaderMark size={18} />
            <span className="brand text-[11px] min-[360px]:text-[13px] min-[768px]:text-[16px] tracking-[0.01em] whitespace-nowrap">
              {brandName}
            </span>
          </Link>
          <div className="shrink-0">{scanOnlineToggle}</div>
          <div className="flex-1" />
          <LangToggle className="shrink-0" compact />
          <div className="shrink-0">
            <CartLink />
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {authButtons}
            {authSignedIn}
          </div>
        </div>
        {/* 2段目: 主要ナビ。番号コードはモバイル非表示・中央寄せ
            （スキャンサイトのモバイルnavと書体/サイズ/整列を1:1で共通化）。 */}
        <nav className="flex flex-wrap items-center justify-center gap-x-3 min-[768px]:gap-x-6 gap-y-1 pb-2 min-[768px]:pb-2.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={lh(n.href)}
              className="text-[11px] min-[768px]:text-[13px] font-light text-muted hover:text-ink transition-colors whitespace-nowrap"
            >
              {t(n.key)}
            </Link>
          ))}
          {/* PC同様、studio(掲載者)にだけ掲載管理への入口をモバイルにも出す。
              admin向けリンクは既存方針どおりモバイル非表示のまま。 */}
          {user?.role === "studio" && (
            <Link
              href={lh("/admin/properties")}
              className="text-[11px] min-[768px]:text-[13px] font-light text-accent hover:text-ink transition-colors whitespace-nowrap"
            >
              {locale === "en" ? "Listings" : "掲載管理"}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
