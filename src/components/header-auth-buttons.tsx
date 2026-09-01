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
  alwaysSignedOut = false,
}: {
  loginLabel: string;
  signupLabel: string;
  /**
   * `<Show when="signed-out">` を外して常に出す。
   * works へ配るヘッダー部品（/partials/header）専用のスイッチ。
   * Clerk の `Show` はクライアント判定なので SSR の HTML には何も残らず、
   * 静的HTMLへ埋める部品では認証ボタンが丸ごと消えてしまうため。
   * ⚠ ボタンのマークアップはここ1箇所（下の `buttons`）のまま。複製しない。
   */
  alwaysSignedOut?: boolean;
}) {
  const pathname = usePathname();
  // 認証画面自身へ戻すと堂々巡りになるので、その場合だけホームへ。
  // usePathname は同一オリジンのパスしか返さないのでオープンリダイレクトの心配はない。
  const backTo =
    pathname && pathname.startsWith("/") && !/^\/(en\/)?sign-(in|up)/.test(pathname)
      ? pathname
      : "/";

  const buttons = (
    <>
      {/* data-auth: works（静的HTML）へ配るヘッダー部品では React が動かないため、
          このボタンを /sign-in・/sign-up への遷移に配線するための目印。
          オンライン版の挙動には一切影響しない（src/lib/header-partial.ts）。 */}
      <SignInButton mode="modal" fallbackRedirectUrl={backTo}>
        <button data-auth="signin" className="px-2 py-1 text-[9px] mono tracking-[0.12em] uppercase border border-line text-ink hover:border-accent hover:text-accent transition whitespace-nowrap">
          {loginLabel}
        </button>
      </SignInButton>
      <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
        <button data-auth="signup" className="px-2 py-1 text-[9px] mono tracking-[0.12em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition whitespace-nowrap">
          {signupLabel}
        </button>
      </SignUpButton>
    </>
  );

  return alwaysSignedOut ? buttons : <Show when="signed-out">{buttons}</Show>;
}
