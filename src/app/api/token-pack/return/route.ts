import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { grantTokenPack } from "@/lib/token-pack-actions";
import { TOKEN_PACK } from "@/lib/schemas";

export const runtime = "nodejs";

/**
 * トークンパック Checkout の成功リダイレクト先。セッションを検証してから
 * 購入トークンを付与する。webhook 未設定でもここで完結する（subscribe/return
 * と同じ方針）。二重付与は grantTokenPack 側の sessionId 記録で防ぐ。
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const sessionId = new URL(req.url).searchParams.get("session_id");

  const ok = () => NextResponse.redirect(`${origin}/account?tokens=granted`);
  const fail = () => NextResponse.redirect(`${origin}/pricing?tokens=error`);
  // subscribe/return と同じ理由でここでも本人確認する。session_id は URL
  // パラメータなので、未認証者がこの URL を再生（replay）できると、認証を
  // 経ずに他人のアカウントへトークンを付与できてしまう。
  const needsSignIn = () =>
    NextResponse.redirect(
      `${origin}/sign-in?redirect_url=${encodeURIComponent("/account")}`,
    );

  if (!sessionId || !stripeEnabled()) return fail();

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    // no_payment_required = 100%割引クーポン適用時。paid と同様に確定扱い。
    if (
      session.payment_status !== "paid" &&
      session.payment_status !== "no_payment_required"
    ) {
      return fail();
    }
    if (session.metadata?.type !== "token_pack") return fail();

    const userId =
      (session.client_reference_id as string | null) ??
      (session.metadata?.userId as string | undefined) ??
      "";
    if (!userId) return fail();

    const me = await getCurrentUser();
    if (!me) return needsSignIn();
    if (me.id !== userId) return NextResponse.redirect(`${origin}/account`);

    const tokens = Number(session.metadata?.tokens) || TOKEN_PACK.tokens;
    await grantTokenPack(userId, session.id, tokens);

    return ok();
  } catch {
    return fail();
  }
}
