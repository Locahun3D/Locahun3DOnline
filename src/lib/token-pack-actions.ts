"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireOnboarded } from "./dal";
import { userRepo } from "./users";
import { TOKEN_PACK } from "./schemas";
import { stripeEnabled, getStripe, tokenPackPriceId } from "./stripe";
import { isStudioPurchaseRestricted } from "./account-schema";

/** リクエスト由来のオリジン（localhost依存を排除）。 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com");
}

/** 購入から N ヶ月後の ISO 文字列。 */
function monthsFrom(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/**
 * トークンパックを購入済みとして付与する（戻りルート／Webhook 共用）。
 *
 * 冪等: sessionId を tokenPackSessions に記録し、既にあれば何もしない。
 * 戻りルートと Webhook は両方が成功時に発火し順序も保証されないため、
 * この判定が無いと同じ支払いで2回付与されうる。
 *
 * 失効日は「最後の購入から1年」に統一する（購入ごとに別々の失効日を持つと
 * 残高を分割管理する必要が出るため）。追加購入で必ず後ろ倒しになるので、
 * 利用者が不利になることはない。
 */
export async function grantTokenPack(
  userId: string,
  sessionId: string,
  tokens: number = TOKEN_PACK.tokens,
): Promise<boolean> {
  let granted = false;
  await userRepo.grantTokens(userId, (u) => {
    const seen = u.tokenPackSessions ?? [];
    if (seen.includes(sessionId)) return u; // 付与済み — 何もしない
    granted = true;
    const now = new Date().toISOString();
    return {
      ...u,
      purchasedTokens: (u.purchasedTokens ?? 0) + tokens,
      purchasedTokensExpiresAt: monthsFrom(now, TOKEN_PACK.expiryMonths),
      tokenPackSessions: [sessionId, ...seen].slice(0, 50),
    };
  });
  return granted;
}

/**
 * トークンパックの購入を開始する。
 *
 * Stripe 配線済み → Checkout(mode:"payment") へリダイレクト。
 * Stripe 未配線(ローカル開発) → 即時付与のスタブ。subscribeAction と同じ方針。
 * 本番は STRIPE_SECRET_KEY が必ず設定されているため、スタブは開発時のみ動く。
 *
 * Price は price_data でその場で組み立てる（Stripe ダッシュボードでの
 * 商品登録を不要にするため）。固定 Price を使いたい場合は
 * STRIPE_PRICE_TOKEN_PACK を設定すればそちらが優先される。
 */
export async function buyTokenPackAction(): Promise<void> {
  const user = await requireOnboarded();

  // 撮影スタジオは自分の物件管理専用アカウント。閲覧トークンの購入は対象外
  // （subscribeAction と同じ方針、2026-08-01）。
  if (isStudioPurchaseRestricted(user.role)) {
    redirect("/pricing?checkout=studio_not_allowed");
  }

  if (!stripeEnabled()) {
    await grantTokenPack(user.id, `stub_${Date.now()}`);
    revalidatePath("/account");
    redirect("/account?tokens=granted");
  }

  const origin = await requestOrigin();
  const stripe = getStripe();
  const u = await userRepo.get(user.id);
  const fixedPrice = tokenPackPriceId();

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        fixedPrice
          ? { price: fixedPrice, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: "jpy",
                unit_amount: TOKEN_PACK.priceYen,
                product_data: {
                  name: `閲覧トークン ${TOKEN_PACK.tokens}枚`,
                  description: `ロケハン3D 閲覧トークン ${TOKEN_PACK.tokens}枚（購入から${TOKEN_PACK.expiryMonths}ヶ月間有効）`,
                },
              },
            },
      ],
      customer: u?.stripeCustomerId ?? undefined,
      customer_email: u?.stripeCustomerId ? undefined : user.email,
      client_reference_id: user.id,
      metadata: {
        type: "token_pack",
        userId: user.id,
        tokens: String(TOKEN_PACK.tokens),
      },
      allow_promotion_codes: true,
      tax_id_collection: { enabled: true },
      billing_address_collection: "auto",
      ...(u?.stripeCustomerId
        ? { customer_update: { name: "auto", address: "auto" } }
        : {}),
      success_url: `${origin}/api/token-pack/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?tokens=cancel`,
    });
  } catch (e) {
    console.error("stripe token pack checkout failed", e);
    redirect("/pricing?tokens=error");
  }

  if (!session.url) redirect("/pricing?tokens=error");
  redirect(session.url);
}
