import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

const PLANS = [
  { key: "INDIVIDUAL", name: "Individual", monthly: 5200, annual: 53040 },
  { key: "STUDIO", name: "Studio", monthly: 9800, annual: 99960 },
  { key: "TEAM", name: "Team", monthly: 29800, annual: 303960 },
] as const;

/**
 * 管理者専用: 3商品×2価格（月額/年額・JPY・継続）をStripeにプログラムで作成し、
 * Price ID を返す。冪等（同名商品・同条件価格があれば再利用）。
 * STRIPE_SECRET_KEY は Worker シークレット（環境変数）から読むため、外部に露出しない。
 */
export async function POST() {
  await requireAdmin();
  if (!stripeEnabled()) {
    return NextResponse.json({ ok: false, error: "STRIPE_SECRET_KEY 未設定" }, { status: 503 });
  }
  const stripe = getStripe();

  try {
    // 既存商品を取得（同名再利用のため）。
    const existingProducts = await stripe.products.list({ active: true, limit: 100 });
    const out: Record<string, string> = {};

    for (const plan of PLANS) {
      let product =
        existingProducts.data.find((p) => p.name === plan.name) ?? null;
      if (!product) {
        product = await stripe.products.create({ name: plan.name });
      }

      const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
      const findPrice = (amount: number, interval: "month" | "year") =>
        prices.data.find(
          (pr) =>
            pr.currency === "jpy" &&
            pr.unit_amount === amount &&
            pr.recurring?.interval === interval,
        ) ?? null;

      const ensure = async (amount: number, interval: "month" | "year") => {
        const hit = findPrice(amount, interval);
        if (hit) return hit;
        return stripe.prices.create({
          product: product!.id,
          currency: "jpy",
          unit_amount: amount,
          recurring: { interval },
        });
      };

      const m = await ensure(plan.monthly, "month");
      const a = await ensure(plan.annual, "year");
      out[`STRIPE_PRICE_${plan.key}_MONTHLY`] = m.id;
      out[`STRIPE_PRICE_${plan.key}_ANNUAL`] = a.id;
    }

    return NextResponse.json({ ok: true, prices: out });
  } catch (e: unknown) {
    const err = e as Stripe.StripeRawError;
    return NextResponse.json(
      { ok: false, error: err?.message || String(e) },
      { status: 500 },
    );
  }
}
