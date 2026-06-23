import "server-only";
import { userRepo } from "./users";
import { PLAN_TOKEN_BUDGET } from "./schemas";
import { oneYearFrom, type AccountPlan, type User } from "./account-schema";

/**
 * プラン+月次トークン+Stripe顧客IDをユーザーに反映（webhook/戻りルート/スタブ共用）。
 * 冪等。ユーザーが存在しなければ null。
 */
export async function applyPlan(
  userId: string,
  plan: AccountPlan,
  customerId?: string | null,
): Promise<User | null> {
  const u = await userRepo.get(userId);
  if (!u) return null;
  const monthly = PLAN_TOKEN_BUDGET[plan];
  return userRepo.upsert({
    ...u,
    plan,
    tokenBalance: monthly,
    tokenExpiresAt: monthly > 0 ? oneYearFrom(new Date().toISOString()) : null,
    stripeCustomerId: customerId ?? u.stripeCustomerId,
  });
}
