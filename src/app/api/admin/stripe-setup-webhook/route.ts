import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { stripeEnabled, getStripe, appUrl } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

// このアプリの webhook ハンドラが実際に処理するイベント（route.ts と一致させる）。
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
];

const ENDPOINT_URL = appUrl("/api/stripe/webhook");

/**
 * 管理者専用: Stripe に webhook エンドポイントをプログラムで登録する。
 * - 使う鍵は Worker シークレットの STRIPE_SECRET_KEY なので、登録先の環境
 *   （本番アカウントのテストモード / 本番モード）が鍵と自動的に一致する。
 *   ダッシュボードで環境を探して間違える事故を防ぐ。
 * - 新規作成時のみ Stripe が署名シークレット（whsec_…）を返す。これを
 *   `wrangler secret put STRIPE_WEBHOOK_SECRET` で投入する（値は管理画面にのみ表示）。
 * - 既に同URLのエンドポイントがある場合、Stripe は whsec を再取得させないため、
 *   ?rotate=1 で削除→再作成し、新しい whsec を発行する。
 */
export async function POST(req: Request) {
  await requireAdmin();
  if (!stripeEnabled()) {
    return NextResponse.json({ ok: false, error: "STRIPE_SECRET_KEY 未設定" }, { status: 503 });
  }
  const stripe = getStripe();
  const rotate = new URL(req.url).searchParams.get("rotate") === "1";

  try {
    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    const match = existing.data.find((e) => e.url === ENDPOINT_URL) ?? null;

    if (match && !rotate) {
      return NextResponse.json({
        ok: true,
        exists: true,
        id: match.id,
        url: match.url,
        events: match.enabled_events,
        message:
          "同じURLのWebhookが既に存在します。署名シークレット(whsec)を再発行するには rotate=1 を付けて実行してください。",
      });
    }

    if (match && rotate) {
      await stripe.webhookEndpoints.del(match.id);
    }

    const created = await stripe.webhookEndpoints.create({
      url: ENDPOINT_URL,
      enabled_events: EVENTS,
      description: "Locahun3D online — subscription & data-sale events",
    });

    return NextResponse.json({
      ok: true,
      created: true,
      rotated: !!(match && rotate),
      id: created.id,
      url: created.url,
      events: created.enabled_events,
      // whsec_… は作成時のみ取得可能。管理者が wrangler secret put で投入する。
      webhookSecret: created.secret,
      command: "npx wrangler secret put STRIPE_WEBHOOK_SECRET",
    });
  } catch (e: unknown) {
    const err = e as Stripe.StripeRawError;
    return NextResponse.json(
      { ok: false, error: err?.message || String(e) },
      { status: 500 },
    );
  }
}
