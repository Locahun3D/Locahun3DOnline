import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/account-schema";
import HeaderMark from "@/components/header-mark";
import CartLink from "@/components/cart-link";
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
  const locale = await getLocale();
  const t = (k: DictKey) => translate(locale, k);
  const lh = (href: string) => localizedHref(href, locale);
  const scanUrl = locale === "en" ? "https://web.locahun3d.com/en/" : "https://web.locahun3d.com/";

  /**
   * PC(lg+)の1行ヘッダーと構成要素は完全に同一 — ハンバーガーに畳まず、
   * モバイル(lg未満)は同じ要素を2段に折り返して縮小表示する。
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
        <button className="px-1 lg:px-4 py-0.5 lg:py-1.5 text-[7px] lg:text-[12px] mono tracking-[0em] lg:tracking-[0.2em] uppercase border border-line text-ink hover:border-accent hover:text-accent transition whitespace-nowrap">
          {t("auth.login")}
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="px-1 lg:px-4 py-0.5 lg:py-1.5 text-[7px] lg:text-[12px] mono tracking-[0em] lg:tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition whitespace-nowrap">
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
          className="flex items-center gap-1 lg:gap-2 text-[9px] lg:text-[12px] mono tracking-[0.05em] lg:tracking-[0.18em] uppercase text-muted hover:text-accent transition whitespace-nowrap"
        >
          <span className="hidden sm:inline border border-line px-1 lg:px-1.5 py-0.5 text-[8px] lg:text-[9px]">
            {ROLE_LABEL[user.role]}
          </span>
          <span className="hidden min-[360px]:inline">{t("auth.mypage")}</span>
        </Link>
      )}
      {/* 管理者リンクはPC専用（旧 mobile-nav.tsx から踏襲、モバイルは基本操作しないため非表示） */}
      {user?.role === "admin" && (
        <Link
          href={lh("/admin")}
          className="hidden lg:inline-block px-2 lg:px-3 py-1 lg:py-1.5 text-[9px] lg:text-[10px] mono tracking-[0.14em] lg:tracking-[0.22em] uppercase text-muted border-l border-line pl-2 lg:pl-3 hover:text-accent transition whitespace-nowrap"
        >
          ⚙ {t("auth.admin")}
        </Link>
      )}
      <UserButton appearance={{ elements: { avatarBox: "w-6 h-6 lg:w-7 lg:h-7" } }} />
    </Show>
  );

  const scanOnlineToggle = (
    <div className="flex items-stretch brand text-[7px] lg:text-[11px] tracking-[0em] lg:tracking-[0.06em]">
      <a
        href={scanUrl}
        className="px-1 lg:px-3 py-0.5 lg:py-1 border border-[#ffb454]/50 text-ink hover:bg-[#ffb454] hover:text-bg transition whitespace-nowrap"
      >
        {t("header.scan")}
      </a>
      <a
        href={lh("/properties")}
        className="px-1 lg:px-3 py-0.5 lg:py-1 border border-l-0 border-[#5ec8e8]/50 text-ink bg-[#5ec8e8]/12 hover:bg-[#5ec8e8] hover:text-bg transition whitespace-nowrap"
      >
        {t("header.online")}
      </a>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur-sm">
      {/* ══ PC(lg+) — 1行 ══ */}
      <div className="hidden lg:flex frame items-center h-16 gap-3">
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
          <Link href={lh("/")} aria-label="ロケハン3D" className="flex items-center gap-2.5">
            <HeaderMark />
            <span className="brand text-lg tracking-[0.01em] whitespace-nowrap">ロケハン3D</span>
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

      {/* ══ モバイル/タブレット(lg未満) — 2段。PCと同じ要素をサイズ調整して
          全て表示する（要素の非表示・ハンバーガー化はしない）。 ══ */}
      <div className="lg:hidden frame">
        {/* 1段目: ロゴ / スキャン・オンライン / EN / カート / 認証 */}
        <div className="flex items-center h-12 sm:h-14 gap-0.5 sm:gap-1.5">
          <Link href={lh("/")} aria-label="ロケハン3D" className="flex items-center gap-1 shrink-0">
            <HeaderMark size={18} />
            <span className="brand text-[10px] min-[360px]:text-[12px] sm:text-sm tracking-[0.01em] whitespace-nowrap">
              ロケハン3D
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
        {/* 2段目: 主要ナビ4項目。番号コードはPC同様「余裕がある幅でのみ」表示
            （PC側も 1440px 未満では同じコードを隠している=既存の慣習を踏襲）。 */}
        <nav className="flex items-center justify-between gap-0.5 sm:gap-1 pb-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={lh(n.href)}
              className="flex items-center gap-1 text-[10px] sm:text-[11px] font-light text-muted hover:text-ink transition-colors whitespace-nowrap"
            >
              <span className="hidden min-[360px]:inline mono text-[8px] tracking-[0.1em] opacity-50">
                {n.code}
              </span>
              {t(n.key)}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
