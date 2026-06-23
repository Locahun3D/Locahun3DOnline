import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { purchaseRepo } from "@/lib/purchases";
import { track } from "@/lib/analytics";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";

export const runtime = "nodejs";

interface CartLine {
  propertyId: string;
  splatItemIndex: number;
}

/**
 * カート一括購入。複数の3Dデータをまとめて購入する（TurboSquid風）。
 *  - stub: 各項目を即時 completed で作成。
 *  - Stripe: 全項目を1つの Checkout セッション（複数 line_items）にまとめる。
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rawItems: CartLine[] = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ error: "カートが空です" }, { status: 400 });
  }

  // 検証 + 重複/購入済み除外。
  const resolved: {
    propertyId: string;
    splatItemIndex: number;
    title: string;
    label: string;
    price: number;
  }[] = [];
  const seen = new Set<string>();
  for (const line of rawItems) {
    const propertyId = String(line.propertyId ?? "");
    const idx = typeof line.splatItemIndex === "number" ? line.splatItemIndex : 0;
    const key = `${propertyId}:${idx}`;
    if (!propertyId || seen.has(key)) continue;
    seen.add(key);

    const property = await propertyRepo.get(propertyId);
    const item = property?.splatItems[idx];
    if (!property || !item || !item.forSale || item.salePrice <= 0) continue;
    if (await purchaseRepo.hasPurchased(user.id, propertyId, idx)) continue;

    resolved.push({
      propertyId,
      splatItemIndex: idx,
      title: property.title,
      label: item.label,
      price: item.salePrice,
    });
  }

  if (resolved.length === 0) {
    return NextResponse.json(
      { error: "購入可能な項目がありません（購入済み/販売停止の可能性）", ok: false },
      { status: 409 },
    );
  }

  // ── stub: 即時完了 ──
  if (!stripeEnabled()) {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    for (const r of resolved) {
      await purchaseRepo.upsert({
        id: randomUUID(),
        userId: user.id,
        userEmail: user.email,
        propertyId: r.propertyId,
        propertyTitle: r.title,
        splatItemIndex: r.splatItemIndex,
        itemLabel: r.label,
        priceYen: r.price,
        status: "completed",
        stripeSessionId: "",
        createdAt: now.toISOString(),
        completedAt: now.toISOString(),
        refundReason: "",
      });
      await track(r.propertyId, "purchase", "", day, "desktop", r.price);
    }
    return NextResponse.json({ ok: true, count: resolved.length });
  }

  // ── Stripe: 複数 line_items を 1 セッションに ──
  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const groupId = randomUUID();

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = resolved.map(
    (r) => ({
      price_data: {
        currency: "jpy",
        unit_amount: r.price,
        product_data: {
          name: `3DGSデータ — ${r.title}${r.label ? ` (${r.label})` : ""}`,
          description: `物件ID: ${r.propertyId} / Item #${r.splatItemIndex}`,
        },
      },
      quantity: 1,
    }),
  );

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items,
    client_reference_id: user.id,
    customer_email: user.email,
    metadata: {
      userId: user.id,
      type: "data_cart",
      groupId,
      // 戻りで確定するため、購入対象を metadata に保持。
      items: JSON.stringify(
        resolved.map((r) => ({ p: r.propertyId, i: r.splatItemIndex })),
      ).slice(0, 480),
    },
    tax_id_collection: { enabled: true },
    billing_address_collection: "auto",
    success_url: `${origin}/api/purchase/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cart?checkout=cancel`,
  });

  // 各項目を pending で記録（戻り/Webhookで completed 化）。
  for (const r of resolved) {
    await purchaseRepo.upsert({
      id: randomUUID(),
      userId: user.id,
      userEmail: user.email,
      propertyId: r.propertyId,
      propertyTitle: r.title,
      splatItemIndex: r.splatItemIndex,
      itemLabel: r.label,
      priceYen: r.price,
      status: "pending",
      stripeSessionId: session.id,
      createdAt: new Date().toISOString(),
      refundReason: "",
    });
  }

  return NextResponse.json({ url: session.url });
}
