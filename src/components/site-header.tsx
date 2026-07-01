import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/account-schema";
import HeaderMark from "@/components/header-mark";
import MobileNav from "@/components/mobile-nav";
import CartLink from "@/components/cart-link";
import LangToggle from "@/components/lang-toggle";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref, translate, type DictKey } from "@/lib/i18n/dictionaries";

const NAV: { href: string; key: DictKey; code: string }[] = [
  { href: "/properties", key: "nav.properties", code: "0.1" },
  { href: "/pricing", key: "nav.pricing", code: "0.2" },
  { href: "/about", key: "nav.about", code: "0.3" },
];

export default async function SiteHeader() {
  const user = await getCurrentUser();
  const locale = await getLocale();
  const t = (k: DictKey) => translate(locale, k);
  const lh = (href: string) => localizedHref(href, locale);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-sm">
      <div className="frame flex items-center h-16 gap-3">
        {/* Left zone — hamburger (< lg) + nav (lg+) */}
        <div className="flex items-center gap-7 flex-1 min-w-0">
          <MobileNav loggedIn={!!user} isAdmin={user?.role === "admin"} />
          <nav className="hidden lg:flex items-center gap-7">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={lh(n.href)}
                className="group flex items-center gap-2 text-[13px] font-light text-muted hover:text-ink transition-colors whitespace-nowrap"
              >
                <span className="mono text-[10px] tracking-[0.2em] opacity-50 group-hover:text-accent group-hover:opacity-100 transition">
                  {n.code}
                </span>
                {t(n.key)}
              </Link>
            ))}
          </nav>
        </div>

        {/* Center — brand (switch only on lg+) */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <Link
            href={lh("/")}
            aria-label="ロケハン3D"
            className="flex items-center gap-2.5"
          >
            <HeaderMark />
            <span className="brand text-base sm:text-lg tracking-[0.01em] whitespace-nowrap">
              ロケハン3D
            </span>
          </Link>
          <div className="hidden lg:flex items-stretch ml-1 brand text-[11px] tracking-[0.06em]">
            <a
              href={locale === "en" ? "https://web.locahun3d.com/en/" : "https://web.locahun3d.com/"}
              className="px-3 py-1 border border-[#ffb454]/50 text-ink hover:bg-[#ffb454] hover:text-bg transition"
            >
              {t("header.scan")}
            </a>
            <a
              href={lh("/properties")}
              className="px-3 py-1 border border-l-0 border-[#5ec8e8]/50 text-ink bg-[#5ec8e8]/12 hover:bg-[#5ec8e8] hover:text-bg transition"
            >
              {t("header.online")}
            </a>
          </div>
        </div>

        {/* Right zone — language + auth */}
        <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
          <LangToggle />
          <CartLink />
          <Show when="signed-out">
            {/* Modal mode: signing in does NOT push a /sign-in history entry,
                so the browser Back button never gets trapped bouncing through
                an already-authenticated /sign-in page. */}
            <SignInButton mode="modal">
              <button className="hidden sm:inline-block px-4 py-1.5 text-[12px] mono tracking-[0.2em] uppercase border border-line text-ink hover:border-accent hover:text-accent transition whitespace-nowrap">
                {t("auth.login")}
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="hidden sm:inline-block px-4 py-1.5 text-[12px] mono tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition whitespace-nowrap">
                {t("auth.signup")}
              </button>
            </SignUpButton>
          </Show>

          <Show when="signed-in">
            {user && (
              <Link
                href={lh("/account")}
                className="hidden lg:flex items-center gap-2 text-[12px] mono tracking-[0.18em] uppercase text-muted hover:text-accent transition whitespace-nowrap"
              >
                <span className="border border-line px-1.5 py-0.5 text-[9px]">
                  {ROLE_LABEL[user.role]}
                </span>
                {t("auth.mypage")}
              </Link>
            )}
            {user?.role === "admin" && (
              <Link
                href={lh("/admin")}
                className="hidden lg:inline-block px-3 py-1.5 text-[10px] mono tracking-[0.22em] uppercase text-muted border-l border-line pl-3 hover:text-accent transition whitespace-nowrap"
              >
                ⚙ {t("auth.admin")}
              </Link>
            )}
            <UserButton appearance={{ elements: { avatarBox: "w-7 h-7" } }} />
          </Show>
        </div>
      </div>
    </header>
  );
}
