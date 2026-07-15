import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { purchaseRepo } from "@/lib/purchases";
import { track } from "@/lib/analytics";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { notifyPurchase } from "@/lib/email";
import { resolveDownloadFiles } from "@/lib/downloads";
import { resolveLicenseOptions } from "@/lib/license-options";
import { getSettings } from "@/lib/site-settings";
import { isDataSaleFree, isDataSaleDisabled } from "@/lib/settings-schema";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";

export const runtime = "nodejs";

interface CartLine {
  propertyId: string;
  splatItemIndex: number;
  license?: string;
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

  // 利用規約への同意をサーバー側でも必須にする（単品購入 /api/purchase と同じ）。
  if (body?.agreedTerms !== true) {
    return NextResponse.json(
      { error: "3Dデータ利用規約への同意が必要です" },
      { status: 400 },
    );
  }
  const termsAgreedAt = new Date().toISOString();

  // 3Dデータ販売の限定無料期間/販売停止設定。単品購入 /api/purchase と同じ
  // ロジックをカートにも適用する（以前はカート側だけこの設定を一切見ておらず、
  // 無料期間中でも満額請求される／販売停止後でも購入できてしまっていた）。
  const settings = await getSettings();
  const nowIso = new Date().toISOString();
  const salesDisabled = isDataSaleDisabled(settings.dataSaleFreePeriod, nowIso);
  const salesFree = isDataSaleFree(settings.dataSaleFreePeriod, nowIso);

  // 検証 + 重複/購入済み除外。
  const resolved: {
    propertyId: string;
    splatItemId: string;
    splatItemIndex: number;
    title: string;
    label: string;
    license: string;
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
    // salePrice<=0 では除外しない（単品購入と同様、¥0固定の無料配布アイテムを
    // 正当な購入対象として扱う。forSale が販売対象であることの唯一の判定条件）。
    if (!property || !item || !item.forSale) continue;
    if (salesDisabled) continue;
    // DLファイル未設定の項目は代金だけ取って何も渡せない事故になるため除外。
    if (resolveDownloadFiles(item).length === 0) continue;
    if (await purchaseRepo.hasPurchased(user.id, propertyId, item.id, idx)) continue;

    // ライセンス区分: クライアントが選んだ区分をサーバー側で再検証する（価格は
    // クライアントを一切信用せず、必ずこのアイテムの現在の licenseOptions/
    // レガシー license から解決する）。未指定 or 無効な区分なら既定(先頭)を使う。
    const licenseOptions = resolveLicenseOptions(item);
    const matchedOption =
      licenseOptions.find((o) => o.license === line.license) ?? licenseOptions[0];

    resolved.push({
      propertyId,
      splatItemId: item.id,
      splatItemIndex: idx,
      title: property.title,
      label: item.label,
      license: matchedOption.license,
      // クライアントは価格を送ってこない（サーバの item.salePrice をそのまま
      // 信用しない設計）。無料期間中は単品購入と同じく¥0に統一する。
      price: salesFree ? 0 : matchedOption.price,
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
      const completed = await purchaseRepo.upsert({
        id: randomUUID(),
        userId: user.id,
        userEmail: user.email,
        propertyId: r.propertyId,
        propertyTitle: r.title,
        splatItemId: r.splatItemId,
        splatItemIndex: r.splatItemIndex,
        itemLabel: r.label,
        license: r.license,
        termsAgreedAt,
        priceYen: r.price,
        status: "completed",
        stripeSessionId: "",
        createdAt: now.toISOString(),
        completedAt: now.toISOString(),
        refundReason: "",
      });
      await track(r.propertyId, "purchase", "", day, "desktop", r.price);
      await notifyPurchase(completed);
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
      splatItemId: r.splatItemId,
      splatItemIndex: r.splatItemIndex,
      itemLabel: r.label,
      license: r.license,
      termsAgreedAt,
      priceYen: r.price,
      status: "pending",
      stripeSessionId: session.id,
      createdAt: new Date().toISOString(),
      refundReason: "",
    });
  }

  return NextResponse.json({ url: session.url });
}
