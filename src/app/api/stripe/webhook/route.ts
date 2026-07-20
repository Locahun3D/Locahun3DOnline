import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeEnabled, planForPriceId } from "@/lib/stripe";
import { userRepo } from "@/lib/users";
import { purchaseRepo } from "@/lib/purchases";
import { track } from "@/lib/analytics";
import { notifyPurchase } from "@/lib/email";
import { PLAN_TOKEN_BUDGET, TOKEN_PACK } from "@/lib/schemas";
import { grantTokenPack } from "@/lib/token-pack-actions";
import { oneYearFrom, oneMonthFrom, type AccountPlan } from "@/lib/account-schema";
import { jstDayKey } from "@/lib/date-format";

export const runtime = "nodejs";

async function findByCustomer(customerId: string) {
  const all = await userRepo.list();
  return all.find((u) => u.stripeCustomerId === customerId) ?? null;
}

/**
 * プラン+トークン枠+Stripe顧客IDをユーザーに反映。
 *
 * 冪等性: トークン枠の付与は「プランが実際に変わった時」だけ行う。Stripe は
 * `customer.subscription.updated` を支払い方法変更・メタデータ編集などでも送る上、
 * 1回の購入で checkout.session.completed と subscription.updated の両方が発火する。
 * 毎回 tokenBalance を月次枠に戻すと、ユーザーが使ったトークンが無料で復活したり
 * （付与悪用）、追加購入分が消える（データ損失）。トークンは年次付与
 * （oneYearFrom）なので、プラン未変更の重複イベントでは残高を一切触らない。
 */
async function applyPlan(
  userId: string,
  plan: AccountPlan,
  customerId: string | null,
) {
  const u = await userRepo.get(userId);
  if (!u) return;
  const nextCustomer = customerId ?? u.stripeCustomerId;

  // プラン未変更 → 残高はそのまま。顧客IDの補完だけ行う（必要な時のみ書込）。
  if (u.plan === plan) {
    if (nextCustomer !== u.stripeCustomerId) {
      await userRepo.upsert({ ...u, stripeCustomerId: nextCustomer });
    }
    return;
  }

  // プラン変更 → 新プランの枠を付与（年次失効）。tokenRefillAt は「1ヶ月後に
  // 満タン補充」の起点。年払いプランは Stripe の請求サイクル自体が年1回なので、
  // これが無いと年払い会員だけ月次補充を受けられない（users.ts 側で毎月精算）。
  const budget = PLAN_TOKEN_BUDGET[plan];
  const now = new Date().toISOString();
  await userRepo.upsert({
    ...u,
    plan,
    tokenBalance: budget,
    tokenExpiresAt: budget > 0 ? oneYearFrom(now) : null,
    tokenRefillAt: budget > 0 ? oneMonthFrom(now) : null,
    stripeCustomerId: nextCustomer,
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

        // トークンパック(単発購入)。主経路は /api/token-pack/return だが、
        // ユーザーが戻る前にタブを閉じると未付与のまま残るため保険で処理する。
        // grantTokenPack は sessionId 記録で冪等なので二重付与にはならない。
        if (s.metadata?.type === "token_pack") {
          const userId = s.client_reference_id || s.metadata?.userId;
          if (
            userId &&
            (s.payment_status === "paid" ||
              s.payment_status === "no_payment_required")
          ) {
            const tokens = Number(s.metadata?.tokens) || TOKEN_PACK.tokens;
            await grantTokenPack(userId, s.id, tokens);
          }
          break;
        }

        if (s.metadata?.type === "data_purchase") {
          const purchaseId = s.metadata.purchaseId;
          // no_payment_required = 合計¥0(無料配布)の確定。paid と同様に扱う。
          if (
            purchaseId &&
            (s.payment_status === "paid" || s.payment_status === "no_payment_required")
          ) {
            // /api/purchase/return とほぼ同時に届き得るため、条件付き更新
            // (status='pending'の場合のみ)で完了させる。null=既に他方が
            // 完了済み＝この呼び出しは通知をスキップ（二重送信防止）。
            const completed = await purchaseRepo.markCompletedIfPending(
              purchaseId,
              new Date().toISOString(),
            );
            if (completed) {
              const day = jstDayKey();
              await track(completed.propertyId, "purchase", "", day, "desktop", completed.priceYen);
              await notifyPurchase(completed);
            }
          }
          break;
        }

        // カート一括購入: return ハンドラが主経路だが、ユーザーが戻り前にタブを
        // 閉じると pending のまま残る（支払済なのに未配信）。Webhook を保険として
        // セッション紐付きの pending を全て completed 化する。
        if (s.metadata?.type === "data_cart") {
          if (s.payment_status === "paid" || s.payment_status === "no_payment_required") {
            const all = await purchaseRepo.list();
            const matched = all.filter(
              (p) => p.stripeSessionId === s.id && p.status === "pending",
            );
            const day = jstDayKey();
            const now = new Date().toISOString();
            for (const p of matched) {
              // 条件付き更新。/api/purchase/return と競合しても二重通知しない。
              const completed = await purchaseRepo.markCompletedIfPending(p.id, now);
              if (!completed) continue;
              await track(completed.propertyId, "purchase", "", day, "desktop", completed.priceYen);
              await notifyPurchase(completed);
            }
          }
          break;
        }

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
      case "invoice.paid": {
        // 年次トークン枠は applyPlan を冪等化したため「プラン変更時のみ」付与される。
        // 正規の更新（subscription_cycle）でだけ、枠を満タンに補充し失効日を更新する。
        // 新規作成(subscription_create)は checkout.session.completed で付与済みなので除外。
        const inv = event.data.object as Stripe.Invoice;
        if (inv.billing_reason !== "subscription_cycle") break;
        const customerId =
          typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
        if (!customerId) break;
        const u = await findByCustomer(customerId);
        if (!u) break;
        const budget = PLAN_TOKEN_BUDGET[u.plan];
        const now = new Date().toISOString();
        // budget へ「セット」（加算でない）なので Stripe の再送でも冪等。
        // tokenRefillAt もここで1ヶ月後に更新し、実際の請求と内部クロックを
        // 揃える（次の自動補充は users.ts 側の月次クロックに委ねる）。
        await userRepo.upsert({
          ...u,
          tokenBalance: budget,
          tokenExpiresAt: budget > 0 ? oneYearFrom(now) : null,
          tokenRefillAt: budget > 0 ? oneMonthFrom(now) : null,
        });
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
