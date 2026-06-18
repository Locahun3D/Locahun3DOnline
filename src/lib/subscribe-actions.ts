"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboarded } from "./dal";
import { userRepo } from "./users";
import { ACCOUNT_PLANS, oneYearFrom, type AccountPlan } from "./account-schema";
import { PLAN_TOKEN_BUDGET } from "./schemas";

/**
 * プラン変更スタブ。Stripe 未配線のため決済は走らず、選択プランを即時反映し
 * 月次トークンを付与する（本配線時に Checkout / Webhook に差し替え）。
 */
export async function subscribeAction(plan: AccountPlan): Promise<void> {
  const user = await requireOnboarded();
  if (!(ACCOUNT_PLANS as readonly string[]).includes(plan)) {
    redirect("/pricing");
  }

  const monthly = PLAN_TOKEN_BUDGET[plan];
  const u = await userRepo.get(user.id);
  if (!u) redirect("/sign-in");

  await userRepo.upsert({
    ...u,
    plan,
    // 月次付与分を反映。0(=Free)なら失効予定もクリア。貢献枠(bonus)は不変。
    tokenBalance: monthly,
    tokenExpiresAt: monthly > 0 ? oneYearFrom(new Date().toISOString()) : null,
  });

  revalidatePath("/account");
  redirect(`/account?plan=${plan}`);
}
