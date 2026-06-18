/**
 * Stripe wiring — server only. Keyless-safe: when STRIPE_SECRET_KEY is unset,
 * `stripeEnabled()` is false and callers fall back to the immediate stub.
 * Add the keys + price IDs to .env to switch the whole flow to real billing.
 */
import "server-only";
import Stripe from "stripe";
import type { AccountPlan } from "./account-schema";

export type BillingInterval = "monthly" | "annual";

let _client: Stripe | null = null;

export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (!_client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _client = new Stripe(key);
  }
  return _client;
}

/** plan + interval -> Stripe Price ID (from env). */
export function priceIdFor(
  plan: AccountPlan,
  interval: BillingInterval,
): string | undefined {
  const map: Record<string, string | undefined> = {
    individual_monthly: process.env.STRIPE_PRICE_INDIVIDUAL_MONTHLY,
    individual_annual: process.env.STRIPE_PRICE_INDIVIDUAL_ANNUAL,
    studio_monthly: process.env.STRIPE_PRICE_STUDIO_MONTHLY,
    studio_annual: process.env.STRIPE_PRICE_STUDIO_ANNUAL,
    team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
    team_annual: process.env.STRIPE_PRICE_TEAM_ANNUAL,
  };
  return map[`${plan}_${interval}`];
}

/** Reverse: a Stripe Price ID -> our plan (for the webhook). */
export function planForPriceId(priceId: string): AccountPlan | null {
  const pairs: [string | undefined, AccountPlan][] = [
    [process.env.STRIPE_PRICE_INDIVIDUAL_MONTHLY, "individual"],
    [process.env.STRIPE_PRICE_INDIVIDUAL_ANNUAL, "individual"],
    [process.env.STRIPE_PRICE_STUDIO_MONTHLY, "studio"],
    [process.env.STRIPE_PRICE_STUDIO_ANNUAL, "studio"],
    [process.env.STRIPE_PRICE_TEAM_MONTHLY, "team"],
    [process.env.STRIPE_PRICE_TEAM_ANNUAL, "team"],
  ];
  for (const [pid, plan] of pairs) {
    if (pid && pid === priceId) return plan;
  }
  return null;
}

/** App origin for Checkout success/cancel redirects. */
export function appUrl(path = ""): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}
