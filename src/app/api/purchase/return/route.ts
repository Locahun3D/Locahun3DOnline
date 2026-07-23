import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { track } from "@/lib/analytics";
import { notifyPurchase } from "@/lib/email";
import { jstDayKey } from "@/lib/date-format";
import { recordPayoutAccruals } from "@/lib/payouts";

export const runtime = "nodejs";

/**
 * Stripe Checkout からの成功リダイレクト先。
 * セッションを検証し、支払い済みなら購入を completed に確定してから
 * 物件ページへ戻す。webhook が未設定でもここで確定するため、
 * STRIPE_SECRET_KEY だけで購入フローが完結する（webhook は冗長な保険）。
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const sessionId = new URL(req.url).searchParams.get("session_id");

  const fail = (propertyId?: string) =>
    NextResponse.redirect(
      `${origin}/properties/${propertyId ?? ""}?purchase=cancel`,
    );
  // 購入開始 (POST /api/purchase) は getCurrentUser() で 401 ガード済みなので、
  // 買い手のブラウザはこの success_url に戻ってきた時点で Clerk セッションを
  // 持っているはず。session_id は URL パラメータとして誰でも再生できるため、
  // 未認証のまま完了処理をすると呼び出し元と購入の所有者が紐付かず、他人の
  // pending 購入を勝手に completed へ進められてしまう。反映前に必ず本人確認する。
  const needsSignIn = () =>
    NextResponse.redirect(
      `${origin}/sign-in?redirect_url=${encodeURIComponent(
        `/api/purchase/return?session_id=${sessionId ?? ""}`,
      )}`,
    );

  if (!sessionId || !stripeEnabled()) return fail();

  let propertyId: string | undefined;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    propertyId =
      (session.metadata?.propertyId as string | undefined) ?? undefined;

    // no_payment_required = Stripe 側で合計¥0と判定され決済不要で確定した状態
    // （無料配布データの購入）。paid と同様に完了させる。
    if (
      session.payment_status !== "paid" &&
      session.payment_status !== "no_payment_required"
    ) {
      return fail(propertyId);
    }

    // 本人確認: 未認証なら何も完了させずサインインへ。
    const user = await getCurrentUser();
    if (!user) return needsSignIn();

    // このセッションに紐づく購入を全て取得（カートは複数 pending を共有）。
    // 呼び出し元のユーザーに限定してリストし、他人の購入には触れない。
    const all = await purchaseRepo.list({ userId: user.id });
    const matched = all.filter((p) => p.stripeSessionId === sessionId);
    if (matched.length === 0) return fail(propertyId);

    const now = new Date();
    const day = jstDayKey(now);
    for (const purchase of matched) {
      if (user.id !== purchase.userId) continue;
      // webhook とほぼ同時に届き得るため条件付き更新(status='pending'の場合
      // のみ)で完了させる。null=既にwebhookが完了済み＝通知をスキップ
      // （購入完了メール二重送信の防止）。
      const completed = await purchaseRepo.markCompletedIfPending(
        purchase.id,
        now.toISOString(),
      );
      if (!completed) continue;
      await track(completed.propertyId, "purchase", "", day, "desktop", completed.priceYen);
      await notifyPurchase(completed);
      await recordPayoutAccruals(completed);
    }

    // カート購入なら購入履歴へ、単品なら物件ページへ。
    const dest =
      session.metadata?.type === "data_cart"
        ? `${origin}/dashboard/purchases`
        : `${origin}/properties/${matched[0].propertyId}?purchase=success`;
    return NextResponse.redirect(dest);
  } catch {
    return fail(propertyId);
  }
}
