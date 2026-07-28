"use client";

import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

/**
 * ヘッダーの「ログイン / 新規登録」ボタン。
 *
 * mode="modal" は維持する（/sign-in の履歴エントリを積まないので、ログイン後に
 * ブラウザの戻るボタンが認証済みの /sign-in を行き来して詰まらない）。
 * ただし modal 経路は redirect_url を持たないため、着地先を明示しないと
 * .env の NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL(=/) が効いてしまい、
 * 「/pricing でログイン → ホームに飛ばされる」（実測）という事故になる。
 * env は環境依存なので、コード側で着地先を決める:
 *   ログイン  = 今見ていたページ（fallbackRedirectUrl）
 *   新規登録  = /onboarding を強制（forceRedirectUrl）
 *              種別選択とNDA提示を飛ばして individual として使い始めるのを防ぐ。
 *              /sign-up ページ側の <SignUp forceRedirectUrl="/onboarding"> と一致。
 */
export default function HeaderAuthButtons({
  loginLabel,
  signupLabel,
}: {
  loginLabel: string;
  signupLabel: string;
}) {
  const pathname = usePathname();
  // 認証画面自身へ戻すと堂々巡りになるので、その場合だけホームへ。
  // usePathname は同一オリジンのパスしか返さないのでオープンリダイレクトの心配はない。
  const backTo =
    pathname && pathname.startsWith("/") && !/^\/(en\/)?sign-(in|up)/.test(pathname)
      ? pathname
      : "/";

  return (
    <Show when="signed-out">
      <SignInButton mode="modal" fallbackRedirectUrl={backTo}>
        <button className="px-1 min-[720px]:px-3 max-[767px]:px-2 min-[1200px]:px-4 py-0.5 min-[720px]:py-1 min-[1200px]:py-1.5 text-[7px] min-[360px]:text-[8px] min-[720px]:text-[11px] min-[1200px]:text-[12px] mono tracking-[0.02em] min-[720px]:tracking-[0.12em] min-[1200px]:tracking-[0.2em] uppercase border border-line text-ink hover:border-accent hover:text-accent transition whitespace-nowrap">
          {loginLabel}
        </button>
      </SignInButton>
      <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
        <button className="px-1 min-[720px]:px-3 max-[767px]:px-2 min-[1200px]:px-4 py-0.5 min-[720px]:py-1 min-[1200px]:py-1.5 text-[7px] min-[360px]:text-[8px] min-[720px]:text-[11px] min-[1200px]:text-[12px] mono tracking-[0.02em] min-[720px]:tracking-[0.12em] min-[1200px]:tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition whitespace-nowrap">
          {signupLabel}
        </button>
      </SignUpButton>
    </Show>
  );
}
