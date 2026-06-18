import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeEnabled, planForPriceId } from "@/lib/stripe";
import { userRepo } from "@/lib/users";
import { PLAN_TOKEN_BUDGET } from "@/lib/schemas";
import { oneYearFrom, type AccountPlan } from "@/lib/account-schema";

export const runtime = "nodejs";

async function findByCustomer(customerId: string) {
  const all = await userRepo.list();
  return all.find((u) => u.stripeCustomerId === customerId) ?? null;
}

/** プラン+月次トークン+Stripe顧客IDをユーザーに反映。 */
async function applyPlan(
  userId: string,
  plan: AccountPlan,
  customerId: string | null,
) {
  const u = await userRepo.get(userId);
  if (!u) return;
  const monthly = PLAN_TOKEN_BUDGET[plan];
  await userRepo.upsert({
    ...u,
    plan,
    tokenBalance: monthly,
    tokenExpiresAt: monthly > 0 ? oneYearFrom(new Date().toISOString()) : null,
    stripeCustomerId: customerId ?? u.stripeCustomerId,
  });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeEnabled() || !secret) {
    return NextResponse.json({ ok: false, reason: "stripe disabled" }, { status: 503 });
  }

  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ ok: false, reason: "bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id || s.metadata?.userId;
        const customerId =
          typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
        let plan = (s.metadata?.plan as AccountPlan | undefined) ?? null;
        if (s.subscription) {
          const subId =
            typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          const priceId = sub.items.data[0]?.price?.id;
          if (priceId) plan = planForPriceId(priceId) ?? plan;
        }
        if (userId && plan) await applyPlan(userId, plan, customerId);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        const priceId = sub.items.data[0]?.price?.id;
        const plan = priceId ? planForPriceId(priceId) : null;
        if (customerId && plan && sub.status === "active") {
          const u = await findByCustomer(customerId);
          if (u) await applyPlan(u.id, plan, customerId);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        if (customerId) {
          const u = await findByCustomer(customerId);
          if (u) await applyPlan(u.id, "free", customerId);
        }
        break;
      }
      default:
        break;
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
