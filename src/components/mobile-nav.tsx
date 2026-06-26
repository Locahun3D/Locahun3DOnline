"use client";

import { useState } from "react";
import Link from "next/link";

const ITEMS: { href: string; label: string; external?: boolean }[] = [
  {
    href: "https://web.locahun3d.com/",
    label: "スキャン",
    external: true,
  },
  { href: "/properties", label: "物件を探す" },
  { href: "/pricing", label: "料金" },
  { href: "/about", label: "サービスについて" },
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

  return (
    <>
      <button
        type="button"
        aria-label="メニューを開く"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="lg:hidden flex flex-col justify-center items-start gap-[5px] p-2.5 -ml-2 min-w-11 min-h-11 text-ink"
      >
        <span className="block w-5 h-px bg-current" />
        <span className="block w-5 h-px bg-current" />
        <span className="block w-5 h-px bg-current" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-bg/[0.97] backdrop-blur-sm flex flex-col px-8 pt-6 pb-12 lg:hidden"
          onClick={close}
        >
          <button
            type="button"
            aria-label="メニューを閉じる"
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
                  key={it.label}
                  href={it.href}
                  onClick={close}
                  className={`${LINK} hover:!text-[#ffb454]`}
                >
                  {it.label}
                </a>
              ) : (
                <Link key={it.label} href={it.href} onClick={close} className={LINK}>
                  {it.label}
                </Link>
              ),
            )}

            {loggedIn ? (
              <>
                <Link href="/account" onClick={close} className={LINK}>
                  マイページ
                </Link>
                {isAdmin && (
                  <Link href="/admin" onClick={close} className={LINK}>
                    管理
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link href="/sign-in" onClick={close} className={LINK}>
                  ログイン
                </Link>
                <Link
                  href="/sign-up"
                  onClick={close}
                  className={`${LINK} text-accent`}
                >
                  新規登録
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
