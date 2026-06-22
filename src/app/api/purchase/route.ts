import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { purchaseRepo } from "@/lib/purchases";
import { stripeEnabled, getStripe, appUrl } from "@/lib/stripe";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const body = await req.json();
  const propertyId = body.propertyId as string | undefined;
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
  }

  const property = await propertyRepo.get(propertyId);
  if (!property || !property.dataForSale || property.dataSalePrice <= 0) {
    return NextResponse.json({ error: "この物件のデータは販売されていません" }, { status: 404 });
  }

  const already = await purchaseRepo.hasPurchased(user.id, propertyId);
  if (already) {
    return NextResponse.json({ error: "すでに購入済みです", ok: false }, { status: 409 });
  }

  const purchaseId = randomUUID();
  const price = property.dataSalePrice;

  if (!stripeEnabled()) {
    await purchaseRepo.upsert({
      id: purchaseId,
      userId: user.id,
      userEmail: user.email,
      propertyId,
      propertyTitle: property.title,
      priceYen: price,
      status: "completed",
      stripeSessionId: "",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, purchaseId });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          unit_amount: price,
          product_data: {
            name: `3DGSデータ — ${property.title}`,
            description: `物件ID: ${property.id}`,
          },
        },
        quantity: 1,
      },
    ],
    client_reference_id: user.id,
    customer_email: user.email,
    metadata: {
      userId: user.id,
      propertyId,
      purchaseId,
      type: "data_purchase",
    },
    tax_id_collection: { enabled: true },
    billing_address_collection: "auto",
    success_url: appUrl(`/properties/${propertyId}?purchase=success`),
    cancel_url: appUrl(`/properties/${propertyId}?purchase=cancel`),
  });

  await purchaseRepo.upsert({
    id: purchaseId,
    userId: user.id,
    userEmail: user.email,
    propertyId,
    propertyTitle: property.title,
    priceYen: price,
    status: "pending",
    stripeSessionId: session.id,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ url: session.url });
}
