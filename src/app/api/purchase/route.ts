import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { purchaseRepo } from "@/lib/purchases";
import { track } from "@/lib/analytics";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { notifyPurchase } from "@/lib/email";
import { resolveDownloadFiles } from "@/lib/downloads";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const body = await req.json();
  const propertyId = body.propertyId as string | undefined;
  const splatItemIndex = typeof body.splatItemIndex === "number" ? body.splatItemIndex : 0;
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
  }

  const property = await propertyRepo.get(propertyId);
  if (!property) {
    return NextResponse.json({ error: "物件が見つかりません" }, { status: 404 });
  }

  const item = property.splatItems[splatItemIndex];
  if (!item || !item.forSale || item.salePrice <= 0) {
    return NextResponse.json({ error: "このデータは販売されていません" }, { status: 404 });
  }
  // 管理画面(価格管理)は「⚠DLファイル未設定」を警告表示するだけで販売自体は
  // 止めない。ここでブロックしないと、配布物ゼロのまま決済だけ成立し、購入者が
  // ダウンロード時に404を踏む（＝代金を払って何も手に入らない）事故になる。
  if (resolveDownloadFiles(item).length === 0) {
    return NextResponse.json(
      { error: "このデータはダウンロードファイルが未設定のため購入できません" },
      { status: 409 },
    );
  }

  const already = await purchaseRepo.hasPurchased(user.id, propertyId, item.id, splatItemIndex);
  if (already) {
    return NextResponse.json({ error: "すでに購入済みです", ok: false }, { status: 409 });
  }

  const purchaseId = randomUUID();
  const price = item.salePrice;

  if (!stripeEnabled()) {
    const now = new Date();
    const completed = await purchaseRepo.upsert({
      id: purchaseId,
      userId: user.id,
      userEmail: user.email,
      propertyId,
      propertyTitle: property.title,
      splatItemId: item.id,
      splatItemIndex,
      itemLabel: item.label,
      license: item.license,
      priceYen: price,
      status: "completed",
      stripeSessionId: "",
      createdAt: now.toISOString(),
      completedAt: now.toISOString(),
      refundReason: "",
    });
    await track(propertyId, "purchase", "", now.toISOString().slice(0, 10), "desktop", price);
    await notifyPurchase(completed);
    return NextResponse.json({ ok: true, purchaseId });
  }

  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          unit_amount: price,
          product_data: {
            name: `3DGSデータ — ${property.title}${item.label ? ` (${item.label})` : ""}`,
            description: `物件ID: ${property.id} / Item #${splatItemIndex}`,
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
      splatItemIndex: String(splatItemIndex),
      purchaseId,
      type: "data_purchase",
    },
    tax_id_collection: { enabled: true },
    billing_address_collection: "auto",
    // 成功時は確認ルートを経由 → セッション検証で購入確定（webhook未設定でも完了する）。
    success_url: `${origin}/api/purchase/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/properties/${propertyId}?purchase=cancel`,
  });

  await purchaseRepo.upsert({
    id: purchaseId,
    userId: user.id,
    userEmail: user.email,
    propertyId,
    propertyTitle: property.title,
    splatItemId: item.id,
    splatItemIndex,
    itemLabel: item.label,
    license: item.license,
    priceYen: price,
    status: "pending",
    stripeSessionId: session.id,
    createdAt: new Date().toISOString(),
    refundReason: "",
  });

  return NextResponse.json({ url: session.url });
}
