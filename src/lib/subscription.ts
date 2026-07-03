import "server-only";
import { userRepo } from "./users";
import { PLAN_TOKEN_BUDGET } from "./schemas";
import { oneYearFrom, oneMonthFrom, type AccountPlan, type User } from "./account-schema";

/**
 * プラン+月次トークン+Stripe顧客IDをユーザーに反映（webhook/戻りルート/スタブ共用）。
 * 冪等。ユーザーが存在しなければ null。
 *
 * tokenRefillAt は「1ヶ月後に満タン補充」の内部クロック起点。年払いでも
 * Stripe の請求サイクルとは独立して毎月補充されるよう、ここで必ずセットする
 * （users.ts の applyTokenLifecycle が読み込み時にこの日付を見て自動補充する）。
 */
export async function applyPlan(
  userId: string,
  plan: AccountPlan,
  customerId?: string | null,
): Promise<User | null> {
  const u = await userRepo.get(userId);
  if (!u) return null;
  const monthly = PLAN_TOKEN_BUDGET[plan];
  const now = new Date().toISOString();
  return userRepo.upsert({
    ...u,
    plan,
    tokenBalance: monthly,
    tokenExpiresAt: monthly > 0 ? oneYearFrom(now) : null,
    tokenRefillAt: monthly > 0 ? oneMonthFrom(now) : null,
    stripeCustomerId: customerId ?? u.stripeCustomerId,
  });
}
