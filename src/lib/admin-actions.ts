"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./dal";
import { userRepo } from "./users";
import { purchaseRepo } from "./purchases";
import { repo as propertyRepo } from "./store";
import { track } from "./analytics";
import { stripeEnabled, getStripe } from "./stripe";
import { notifyRefund } from "./email";
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
  let done = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const u = await userRepo.get(id);
    if (!u) {
      skipped.push(id);
      continue;
    }
    await userRepo.upsert({ ...u, status });
    done++;
  }
  revalidatePath("/admin/accounts");
  return { ok: true as const, count: done, total: ids.length, skipped };
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
  let done = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    if (id === admin.id) {
      skipped.push(id); // 自分自身は削除できない
      continue;
    }
    await userRepo.remove(id);
    done++;
  }
  revalidatePath("/admin/accounts");
  return { ok: true as const, count: done, total: ids.length, skipped };
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

  // 実決済（Stripe）が紐づく購入は、Stripe側でも実返金してから記録を更新する。
  // 返金が失敗したら記録は completed のまま残す（金銭未返却の状態を防ぐ）。
  if (stripeEnabled() && p.stripeSessionId) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(p.stripeSessionId);
      const pi =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (pi) {
        await stripe.refunds.create({ payment_intent: pi });
      }
    } catch {
      // Stripe返金に失敗 → 記録を refunded にせず終了（再試行可能）。
      return;
    }
  }

  const refunded = await purchaseRepo.upsert({
    ...p,
    status: "refunded",
    refundedAt: new Date().toISOString(),
    refundReason: reason,
  });
  const day = new Date().toISOString().slice(0, 10);
  await track(p.propertyId, "refund", "", day, "desktop", p.priceYen);
  await notifyRefund(refunded);
  revalidatePath("/admin/purchases");
}

/**
 * 購入記録を完全削除（テスト購入の掃除用・管理者専用）。
 * 安全側: 実決済が紐づく "completed"（未返金）の購入は削除させない。
 * 削除してよいのは refunded / cancelled / pending、または Stripe 紐付けの無い
 * テスト即時完了の購入のみ。
 */
export async function deletePurchaseAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const p = await purchaseRepo.get(id);
  if (!p) return;
  // 実入金が残っている可能性のある購入（Stripe紐付け＋completed）は削除不可。
  // 先に返金してから削除する運用にする。
  if (p.status === "completed" && p.stripeSessionId) return;
  await purchaseRepo.remove(id);
  revalidatePath("/admin/purchases");
}

/** 削除可能か: 実入金が残り得る (Stripe紐付き completed) 以外は掃除対象。 */
function isDeletablePurchase(p: { status: string; stripeSessionId?: string }): boolean {
  return !(p.status === "completed" && !!p.stripeSessionId);
}

/**
 * テスト購入の一括削除（管理者専用）。
 * Stripe紐付きの未返金「完了」だけ残し、それ以外（返金済・処理中・キャンセル・
 * テスト即時完了）をまとめて削除する。
 */
export async function bulkDeleteTestPurchasesAction(): Promise<void> {
  await requireAdmin();
  const all = await purchaseRepo.list();
  const targets = all.filter(isDeletablePurchase);
  for (const p of targets) {
    await purchaseRepo.remove(p.id);
  }
  revalidatePath("/admin/purchases");
}

/**
 * 価格一括管理: データ販売の販売可否・販売価格をまとめて更新する。
 * フォームは hidden `items` に [{propertyId, idx}] の JSON を持ち、各行の
 * `sale:<propertyId>:<idx>`（チェックボックス）と `price:<propertyId>:<idx>`
 * （数値）を読む。物件ごとに 1 回だけ upsert する（R2 書込を最小化）。
 */
export async function bulkUpdateSalePricesAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  let items: { propertyId: string; idx: number }[] = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return;
  }
  if (!Array.isArray(items) || items.length === 0) return;

  // 物件IDごとに対象アイテムをまとめる。
  const byProperty = new Map<string, number[]>();
  for (const it of items) {
    if (!it?.propertyId || typeof it.idx !== "number") continue;
    const list = byProperty.get(it.propertyId) ?? [];
    list.push(it.idx);
    byProperty.set(it.propertyId, list);
  }

  for (const [propertyId, idxs] of byProperty) {
    const property = await propertyRepo.get(propertyId);
    if (!property) continue;

    let changed = false;
    const splatItems = property.splatItems.map((item, i) => {
      if (!idxs.includes(i)) return item;
      const forSale = formData.get(`sale:${propertyId}:${i}`) != null;
      const rawPrice = Number(formData.get(`price:${propertyId}:${i}`) ?? item.salePrice);
      const salePrice = Math.max(0, Math.min(99_999_999, Math.trunc(Number.isFinite(rawPrice) ? rawPrice : 0)));
      if (item.forSale === forSale && item.salePrice === salePrice) return item;
      changed = true;
      return { ...item, forSale, salePrice };
    });

    if (changed) {
      await propertyRepo.upsert({ ...property, splatItems });
    }
  }

  revalidatePath("/admin/pricing");
  revalidatePath("/admin/purchases");
}
