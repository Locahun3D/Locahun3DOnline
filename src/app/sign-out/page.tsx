import SignOutRedirect from "@/components/sign-out-redirect";

export const metadata = { title: "サインアウト" };

/**
 * サインアウトしてから任意のページへ着地させる中継ページ。
 *
 * ── なぜ必要か ────────────────────────────────────────────
 * 「別のアカウントを作ってください」という導線でログイン中に /sign-up へ送ると、
 * Clerk はサインアップ画面を描画せずマイページへ弾く。ボタンを押しても
 * 何も起きないように見える（ユーザー報告 2026-07-29、掲載依頼ページ）。
 * サインアウトを挟めば素直に登録画面へ着地する。
 *
 * ⚠ 着地先は同一オリジンのパスだけ許可する（オープンリダイレクト防止）。
 *   判定は client 側 SignOutRedirect が持つ（Clerk の signOut が client API のため）。
 */
export default async function SignOutPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  return (
    <div className="frame py-24 min-h-[50vh] flex items-center justify-center">
      <p className="mono text-[11px] tracking-[0.2em] uppercase text-muted">
        サインアウトしています…
      </p>
      <SignOutRedirect to={redirect ?? "/"} />
    </div>
  );
}
