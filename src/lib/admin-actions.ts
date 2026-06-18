"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./dal";
import { userRepo } from "./users";
import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
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
  await userRepo.upsert({ ...u, tokenBalance: balance });
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
