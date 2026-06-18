"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboarded } from "./dal";
import { userRepo } from "./users";
import { ACCOUNT_PLANS, oneYearFrom, type AccountPlan } from "./account-schema";
import { PLAN_TOKEN_BUDGET } from "./schemas";
import {
  stripeEnabled,
  getStripe,
  priceIdFor,
  appUrl,
  type BillingInterval,
} from "./stripe";

/** 即時反映スタブ: プランを切り替え、月次トークンを付与する (Stripe未配線時)。 */
async function applyPlanStub(userId: string, plan: AccountPlan): Promise<void> {
  const monthly = PLAN_TOKEN_BUDGET[plan];
  const u = await userRepo.get(userId);
  if (!u) return;
  await userRepo.upsert({
    ...u,
    plan,
    tokenBalance: monthly,
    tokenExpiresAt: monthly > 0 ? oneYearFrom(new Date().toISOString()) : null,
  });
}

/**
 * プラン申し込み。
 * - Stripe 配線済み(キーあり)かつ有料プラン → Checkout へリダイレクト。
 * - 未配線 or Free → 即時反映スタブ。
 */
export async function subscribeAction(
  plan: AccountPlan,
  interval: BillingInterval = "monthly",
): Promise<void> {
  const user = await requireOnboarded();
  if (!(ACCOUNT_PLANS as readonly string[]).includes(plan)) redirect("/pricing");

  // Free はダウングレード扱い。Stripe解約は Customer Portal 側で行う。
  if (plan === "free") {
    await applyPlanStub(user.id, "free");
    revalidatePath("/account");
    redirect("/account?plan=free");
  }

  const priceId = stripeEnabled() ? priceIdFor(plan, interval) : undefined;

  // Stripe 未配線、または Price 未設定 → スタブで即時反映。
  if (!priceId) {
    await applyPlanStub(user.id, plan);
    revalidatePath("/account");
    redirect(`/account?plan=${plan}`);
  }

  // Stripe Checkout セッションを作成してリダイレクト。
  const u = await userRepo.get(user.id);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: u?.stripeCustomerId ?? undefined,
    customer_email: u?.stripeCustomerId ? undefined : user.email,
    client_reference_id: user.id,
    metadata: { userId: user.id, plan },
    subscription_data: { metadata: { userId: user.id, plan } },
    allow_promotion_codes: true,
    // サブスクは毎月の請求書を自動発行。電子帳簿/インボイス制度対応として
    // 顧客の登録番号(T番号)・住所を収集し、毎月の請求書へ自動反映する。
    tax_id_collection: { enabled: true },
    billing_address_collection: "auto",
    ...(u?.stripeCustomerId
      ? { customer_update: { name: "auto", address: "auto" } }
      : {}),
    success_url: appUrl(`/account?plan=${plan}&checkout=success`),
    cancel_url: appUrl(`/pricing?checkout=cancel`),
  });

  if (!session.url) redirect("/pricing?checkout=error");
  redirect(session.url);
}

/** Stripe Customer Portal を開く（支払い方法変更・解約）。 */
export async function openBillingPortalAction(): Promise<void> {
  const user = await requireOnboarded();
  if (!stripeEnabled()) redirect("/pricing");
  const u = await userRepo.get(user.id);
  if (!u?.stripeCustomerId) redirect("/pricing");

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: u.stripeCustomerId,
    return_url: appUrl("/account"),
  });
  redirect(portal.url);
}
