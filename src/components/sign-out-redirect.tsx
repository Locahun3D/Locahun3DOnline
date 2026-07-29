"use client";

import { useEffect, useRef } from "react";
import { useClerk } from "@clerk/nextjs";

/**
 * マウントされたらサインアウトし、指定パスへ遷移する。/sign-out ページの実体。
 *
 * ⚠ 着地先は「/」で始まり「//」で始まらないパスだけ許可する。
 *   `//evil.example` は URL としては別オリジンへ飛ぶため、素朴な
 *   startsWith("/") チェックだけではオープンリダイレクトになる。
 * ⚠ StrictMode の二重マウントで signOut が2回走らないよう ref で1回に固定する。
 */
export default function SignOutRedirect({ to }: { to: string }) {
  const { signOut } = useClerk();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const safe = to.startsWith("/") && !to.startsWith("//") ? to : "/";
    void signOut({ redirectUrl: safe });
  }, [signOut, to]);

  return null;
}
