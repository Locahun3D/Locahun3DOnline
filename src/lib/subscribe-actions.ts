"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireOnboarded } from "./dal";
import { userRepo } from "./users";
import { ACCOUNT_PLANS, type AccountPlan, isStudioPurchaseRestricted } from "./account-schema";
import { applyPlan } from "./subscription";
import { notifySubscription } from "./email";
import {
  stripeEnabled,
  getStripe,
  priceIdFor,
  type BillingInterval,
} from "./stripe";

/** 即時反映スタブ: プランを切り替え、月次トークン付与＋開始メール (Stripe未配線時)。 */
async function applyPlanStub(
  userId: string,
  plan: AccountPlan,
  email: string,
): Promise<void> {
  await applyPlan(userId, plan);
  await notifySubscription({ to: email, plan, viaStripe: false });
}

/** リクエスト由来のオリジン（localhost依存を排除）。 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com");
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

  // 撮影スタジオは自分の物件管理専用アカウント。閲覧サブスクの対象外
  // （2026-08-01 の方針。トークン購入・他物件のデータ購入も同様に禁止）。
  if (isStudioPurchaseRestricted(user.role)) {
    redirect("/pricing?checkout=studio_not_allowed");
  }

  // Team の「NDA締結で全て閲覧可」は canViewBackyard/canViewNdaOnly
  // (account-schema.ts) が role==="production" を要求する。ここで弾かないと、
  // production 以外のロールが Team を購入して料金を払っても、広告どおりの
  // 閲覧特典を一切得られないまま課金だけ発生してしまう。
  if (plan === "team" && user.role !== "production") {
    redirect("/pricing?checkout=team_role_required");
  }

  // Free はダウングレード扱い。Stripe解約は Customer Portal 側で行う。
  if (plan === "free") {
    await applyPlanStub(user.id, "free", user.email);
    revalidatePath("/account");
    redirect("/account?plan=free");
  }

  const priceId = stripeEnabled() ? priceIdFor(plan, interval) : undefined;

  // Stripe 未配線、または Price 未設定 → スタブで即時反映。
  if (!priceId) {
    await applyPlanStub(user.id, plan, user.email);
    revalidatePath("/account");
    redirect(`/account?plan=${plan}`);
  }

  // Stripe Checkout セッションを作成してリダイレクト。
  const u = await userRepo.get(user.id);
  const origin = await requestOrigin();
  const stripe = getStripe();
  let session: Awaited<
    ReturnType<typeof stripe.checkout.sessions.create>
  >;
  try {
    session = await stripe.checkout.sessions.create({
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
      // 戻りルートでセッション検証→プラン反映→メール送信（webhook未設定でも完結）。
      success_url: `${origin}/api/subscribe/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancel`,
    });
  } catch (e) {
    // Stripe API エラーで汎用エラー画面になるのを防ぎ、料金ページへ誘導。
    console.error("stripe checkout create failed", e);
    redirect("/pricing?checkout=error");
  }

  if (!session.url) redirect("/pricing?checkout=error");
  redirect(session.url);
}

/** Stripe Customer Portal を開く（支払い方法変更・解約）。 */
export async function openBillingPortalAction(): Promise<void> {
  const user = await requireOnboarded();
  if (isStudioPurchaseRestricted(user.role)) redirect("/pricing");
  if (!stripeEnabled()) redirect("/pricing");
  const u = await userRepo.get(user.id);
  if (!u?.stripeCustomerId) redirect("/pricing");

  const origin = await requestOrigin();
  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: u.stripeCustomerId,
    return_url: `${origin}/account`,
  });
  redirect(portal.url);
}
