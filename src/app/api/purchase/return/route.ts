import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { track } from "@/lib/analytics";

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

    const purchase = await purchaseRepo.getByStripeSession(sessionId);
    if (!purchase) return fail(propertyId);

    // 本人確認（戻ってきたユーザー＝購入者）。
    const user = await getCurrentUser();
    if (user && user.id !== purchase.userId) {
      return fail(purchase.propertyId);
    }

    if (purchase.status === "pending") {
      const now = new Date();
      await purchaseRepo.upsert({
        ...purchase,
        status: "completed",
        completedAt: now.toISOString(),
      });
      await track(
        purchase.propertyId,
        "purchase",
        "",
        now.toISOString().slice(0, 10),
        "desktop",
        purchase.priceYen,
      );
    }

    return NextResponse.redirect(
      `${origin}/properties/${purchase.propertyId}?purchase=success`,
    );
  } catch {
    return fail(propertyId);
  }
}
