"use client";

/**
 * Header auth/profile entry point.
 *
 * Two states:
 *   - Logged out: shows the combined "ログイン / 新規登録" CTA → /sign-in
 *   - Logged in:  shows a profile button that opens a dropdown with
 *                 dashboard / profile / token balance / sign out
 *
 * Auth is not wired yet (Clerk lands later). For now the state is driven by
 * a localStorage flag, toggleable via ?login=1 / ?login=0 URL params for
 * local QA. When Clerk is wired, replace `useDemoAuth()` with
 * `useUser()` / `auth()`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

function useDemoAuth() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const param = sp.get("login");
      if (param === "1") localStorage.setItem("demo-login", "1");
      else if (param === "0") localStorage.removeItem("demo-login");
      setLoggedIn(localStorage.getItem("demo-login") === "1");
    } catch {
      /* SSR/no-localStorage env */
    }
  }, []);
  return {
    loggedIn,
    signOut: () => {
      try {
        localStorage.removeItem("demo-login");
      } catch {}
      setLoggedIn(false);
    },
  };
}

export default function UserNav() {
  const { loggedIn, signOut } = useDemoAuth();
  const [open, setOpen] = useState(false);

  if (!loggedIn) {
    return (
      <Link
        href="/sign-in"
        className="px-4 py-1.5 text-[12px] mono tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
      >
        ログイン / 新規登録
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 text-[12px] mono tracking-[0.2em] uppercase border border-line hover:border-accent hover:text-accent transition"
      >
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-bg text-[10px]"
        >
          中
        </span>
        マイページ
        <span className="text-[8px] opacity-60">▼</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full mt-2 z-40 min-w-[260px] border border-line bg-bg shadow-2xl">
            <div className="px-4 py-3 border-b border-line">
              <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60">
                Signed in as
              </div>
              <div className="text-[13px] mt-0.5">中村 航</div>
              <div className="mono text-[10px] text-muted mt-0.5 truncate">
                nakamurakou1108@gmail.com
              </div>
            </div>

            <div className="px-4 py-3 border-b border-line text-[11px] space-y-1.5">
              <div className="flex justify-between">
                <span className="mono opacity-60">今月のトークン</span>
                <span className="text-accent">残 8 / 8</span>
              </div>
              <div className="flex justify-between">
                <span className="mono opacity-60">プラン</span>
                <span className="text-ink">Individual</span>
              </div>
              <div className="flex justify-between">
                <span className="mono opacity-60">ブックマーク</span>
                <span className="text-ink">0 件</span>
              </div>
            </div>

            <nav className="py-1 text-[12px]">
              {[
                { href: "/dashboard",        label: "📊 ダッシュボード" },
                { href: "/account",          label: "👤 プロフィール" },
                { href: "/account/billing",  label: "💳 課金 / 領収書" },
                { href: "/account/history",  label: "🕒 視聴履歴" },
                { href: "/pricing",          label: "🔧 プラン変更" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 hover:bg-[#0d0d0d] hover:text-accent transition"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <button
              type="button"
              onClick={() => {
                signOut();
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-2.5 border-t border-line text-[12px] mono tracking-[0.18em] uppercase text-muted hover:text-accent hover:bg-[#0d0d0d] transition"
            >
              ログアウト
            </button>

            <div className="px-4 py-2 border-t border-line mono text-[9px] tracking-[0.22em] uppercase opacity-40">
              dev: ?login=0 でログアウト状態
            </div>
          </div>
        </>
      )}
    </div>
  );
}
