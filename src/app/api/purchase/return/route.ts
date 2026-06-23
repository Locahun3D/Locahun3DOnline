import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { track } from "@/lib/analytics";
import { notifyPurchase } from "@/lib/email";

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

  if (!sessionId || !stripeEnabled()) return fail();

  let propertyId: string | undefined;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    propertyId =
      (session.metadata?.propertyId as string | undefined) ?? undefined;

    if (session.payment_status !== "paid") return fail(propertyId);

    // このセッションに紐づく購入を全て取得（カートは複数 pending を共有）。
    const user = await getCurrentUser();
    const all = await purchaseRepo.list(user ? { userId: user.id } : undefined);
    const matched = all.filter((p) => p.stripeSessionId === sessionId);
    if (matched.length === 0) return fail(propertyId);

    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    for (const purchase of matched) {
      if (user && user.id !== purchase.userId) continue;
      if (purchase.status === "pending") {
        const completed = await purchaseRepo.upsert({
          ...purchase,
          status: "completed",
          completedAt: now.toISOString(),
        });
        await track(purchase.propertyId, "purchase", "", day, "desktop", purchase.priceYen);
        await notifyPurchase(completed);
      }
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
