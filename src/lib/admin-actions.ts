"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./dal";
import { userRepo } from "./users";
import { purchaseRepo } from "./purchases";
import { track } from "./analytics";
import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  oneYearFrom,
  type AccountRole,
  type AccountStatus,
} from "./account-schema";

/** Approve a pending studio / production account. */
export async function approveAccountAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const u = await userRepo.get(id);
  if (!u) return;
  await userRepo.upsert({ ...u, status: "active" });
  revalidatePath("/admin/accounts");
}

/** Set an account's status (active / pending / suspended). */
export async function setAccountStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as AccountStatus;
  if (!ACCOUNT_STATUSES.includes(status)) return;
  const u = await userRepo.get(id);
  if (!u) return;
  await userRepo.upsert({ ...u, status });
  revalidatePath("/admin/accounts");
}

/** Change an account's role (e.g. promote to admin, or fix a mis-signup). */
export async function setAccountRoleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as AccountRole;
  if (!ACCOUNT_ROLES.includes(role)) return;
  // Guard: don't let an admin demote themselves and lock everyone out.
  if (id === admin.id && role !== "admin") return;
  const u = await userRepo.get(id);
  if (!u) return;
  await userRepo.upsert({ ...u, role });
  revalidatePath("/admin/accounts");
}

/** Grant or set token balance (manual top-up while Stripe is unwired). */
export async function setTokenBalanceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const balance = Math.max(0, Math.trunc(Number(formData.get("balance") ?? 0)));
  const u = await userRepo.get(id);
  if (!u) return;
  // 付与トークンは1年で失効。残高 0 なら失効予定もクリア。
  const tokenExpiresAt = balance > 0 ? oneYearFrom(new Date().toISOString()) : null;
  await userRepo.upsert({ ...u, tokenBalance: balance, tokenExpiresAt });
  revalidatePath("/admin/accounts");
}

/** Delete an account (cannot delete yourself). */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id === admin.id) return;
  await userRepo.remove(id);
  revalidatePath("/admin/accounts");
}

/** 一括: 選択アカウントの status をまとめて変更。 */
export async function bulkSetAccountStatusAction(
  ids: string[],
  status: AccountStatus,
) {
  await requireAdmin();
  if (!ACCOUNT_STATUSES.includes(status)) return { ok: false as const };
  for (const id of ids) {
    const u = await userRepo.get(id);
    if (!u) continue;
    await userRepo.upsert({ ...u, status });
  }
  revalidatePath("/admin/accounts");
  return { ok: true as const, count: ids.length };
}

/** Link a studio owner account to a set of property IDs they can manage. */
export async function linkPropertiesToUserAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const propertyIdsRaw = String(formData.get("propertyIds") ?? "");
  const propertyIds = propertyIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const u = await userRepo.get(id);
  if (!u) return;
  await userRepo.upsert({ ...u, linkedPropertyIds: propertyIds });
  revalidatePath("/admin/accounts");
}

/** 一括: 選択アカウントを削除 (自分自身は除外)。 */
export async function bulkDeleteAccountsAction(ids: string[]) {
  const admin = await requireAdmin();
  for (const id of ids) {
    if (id === admin.id) continue;
    await userRepo.remove(id);
  }
  revalidatePath("/admin/accounts");
  return { ok: true as const };
}

/** 購入を返金処理する。 */
export async function refundPurchaseAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const p = await purchaseRepo.get(id);
  if (!p || p.status !== "completed") return;
  await purchaseRepo.upsert({
    ...p,
    status: "refunded",
    refundedAt: new Date().toISOString(),
    refundReason: reason,
  });
  const day = new Date().toISOString().slice(0, 10);
  await track(p.propertyId, "refund", "", day, "desktop", p.priceYen);
  revalidatePath("/admin/purchases");
}
