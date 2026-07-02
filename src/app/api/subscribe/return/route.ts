import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { stripeEnabled, getStripe, planForPriceId } from "@/lib/stripe";
import { applyPlan } from "@/lib/subscription";
import { notifySubscription } from "@/lib/email";
import type { AccountPlan } from "@/lib/account-schema";
import type Stripe from "stripe";

export const runtime = "nodejs";

/**
 * サブスク Checkout 成功リダイレクト先。セッションを検証してプランを反映し、
 * 開始メール（領収書相当）を送ってからマイページへ戻す。webhook未設定でも
 * ここで完結するため、STRIPE_SECRET_KEY と Price 設定だけで動作する。
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const sessionId = new URL(req.url).searchParams.get("session_id");

  const ok = (plan?: string) =>
    NextResponse.redirect(`${origin}/account?plan=${plan ?? ""}&checkout=success`);
  const fail = () => NextResponse.redirect(`${origin}/pricing?checkout=error`);
  // このルートは Stripe Checkout の success_url としてのみ呼ばれ、購入開始
  // (subscribeAction) は requireOnboarded() 済みなので買い手のブラウザには
  // Clerk セッションが載っているはず。とはいえ session_id は URL パラメータ
  // なので、未認証者がこの URL を直接叩いて再生（replay）できてしまうと、
  // 認証を経ずに他人のアカウントへプランを反映できてしまう（支払い自体は
  // Stripe 側で検証済みなので無償アップグレードにはならないが、状態変更が
  // 呼び出し元に紐付いていない）。そこで反映前に必ず本人確認する。
  const needsSignIn = () =>
    NextResponse.redirect(
      `${origin}/sign-in?redirect_url=${encodeURIComponent("/account")}`,
    );

  if (!sessionId || !stripeEnabled()) return fail();

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    if (session.payment_status !== "paid" && session.status !== "complete") {
      return fail();
    }

    const userId =
      (session.client_reference_id as string | null) ??
      (session.metadata?.userId as string | undefined) ??
      "";
    if (!userId) return fail();

    // 本人確認: 未認証なら反映せずサインインへ。認証済みでもセッションの
    // 持ち主と一致しない場合は反映せず account へ戻す（付与しない）。
    const me = await getCurrentUser();
    if (!me) return needsSignIn();
    if (me.id !== userId) return NextResponse.redirect(`${origin}/account`);

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null;

    // プラン解決: metadata → Price ID 逆引き。
    let plan = (session.metadata?.plan as AccountPlan | undefined) ?? null;
    const sub = session.subscription as Stripe.Subscription | string | null;
    if (typeof sub !== "string" && sub) {
      const priceId = sub.items.data[0]?.price?.id;
      if (priceId) plan = planForPriceId(priceId) ?? plan;
    }
    if (!plan) return fail();

    const updated = await applyPlan(userId, plan, customerId);

    if (updated) {
      await notifySubscription({
        to: updated.email,
        plan,
        amountYen: session.amount_total ?? undefined,
        viaStripe: true,
      });
    }

    return ok(plan);
  } catch {
    return fail();
  }
}
