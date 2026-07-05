"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useT, useHref, useLocale } from "@/components/locale-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";

const ITEMS: { href: string; key: DictKey; external?: boolean }[] = [
  { href: "https://web.locahun3d.com/", key: "header.scan", external: true },
  { href: "/properties", key: "nav.properties" },
  { href: "/pricing", key: "nav.pricing" },
  { href: "/about", key: "nav.about" },
];

const LINK =
  "serif text-2xl py-3.5 border-b border-line hover:text-accent transition flex items-center gap-2";

export default function MobileNav({
  loggedIn,
  isAdmin,
}: {
  loggedIn: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = useT();
  const lh = useHref();
  const locale = useLocale();
  // EN時はスキャンサイトのEN版へ（サイト間でEN維持）。
  const scanUrl =
    locale === "en" ? "https://web.locahun3d.com/en/" : "https://web.locahun3d.com/";

  return (
    <>
      <button
        type="button"
        aria-label={t("nav.menuOpen")}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="lg:hidden flex flex-col justify-center items-start gap-[5px] p-2.5 -ml-2 min-w-11 min-h-11 text-ink"
      >
        <span className="block w-5 h-px bg-current" />
        <span className="block w-5 h-px bg-current" />
        <span className="block w-5 h-px bg-current" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[60] bg-bg/[0.97] backdrop-blur-sm flex flex-col px-8 pt-6 pb-12 overflow-y-auto lg:hidden"
          onClick={close}
        >
          <button
            type="button"
            aria-label={t("nav.menuClose")}
            onClick={close}
            className="self-end mono text-[11px] tracking-[0.24em] uppercase text-muted hover:text-accent p-3 min-h-11 inline-flex items-center"
          >
            ✕ CLOSE
          </button>

          <nav
            className="mt-6 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {ITEMS.map((it) =>
              it.external ? (
                <a
                  key={it.key}
                  href={scanUrl}
                  onClick={close}
                  className={`${LINK} hover:!text-[#ffb454]`}
                >
                  {t(it.key)}
                </a>
              ) : (
                <Link key={it.key} href={lh(it.href)} onClick={close} className={LINK}>
                  {t(it.key)}
                </Link>
              ),
            )}

            {loggedIn ? (
              <>
                <Link href={lh("/account")} onClick={close} className={LINK}>
                  {t("auth.mypage")}
                </Link>
                {isAdmin && (
                  <Link href={lh("/admin")} onClick={close} className={LINK}>
                    {t("auth.adminShort")}
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link href={lh("/sign-in")} onClick={close} className={LINK}>
                  {t("auth.login")}
                </Link>
                <Link
                  href={lh("/sign-up")}
                  onClick={close}
                  className={`${LINK} text-accent`}
                >
                  {t("auth.signup")}
                </Link>
              </>
            )}
          </nav>
        </div>,
        document.body,
      )}
    </>
  );
}
