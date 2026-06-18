"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireOnboarded } from "./dal";
import { userRepo } from "./users";
import { giftCodeRepo, generateGiftCode } from "./gift-codes";
import {
  GIFT_BUCKETS,
  GIFT_STATUSES,
  REDEEM_ERROR_MESSAGE,
  redeemableFor,
  type GiftBucket,
  type GiftCode,
  type GiftStatus,
} from "./gift-schema";

// ── Admin: create ──────────────────────────────────────────────────────────
export type CreateGiftState =
  | { ok: true; code: GiftCode }
  | { ok: false; error: string }
  | undefined;

export async function createGiftCodeAction(
  _prev: CreateGiftState,
  formData: FormData,
): Promise<CreateGiftState> {
  await requireAdmin();
  const admin = await requireOnboarded();

  const tokens = Math.trunc(Number(formData.get("tokens") ?? 0));
  if (!Number.isFinite(tokens) || tokens < 1) {
    return { ok: false, error: "トークン数は 1 以上で指定してください。" };
  }
  const bucketRaw = String(formData.get("bucket") ?? "bonus");
  const bucket: GiftBucket = (GIFT_BUCKETS as readonly string[]).includes(bucketRaw)
    ? (bucketRaw as GiftBucket)
    : "bonus";
  const maxUses = Math.max(1, Math.trunc(Number(formData.get("maxUses") ?? 1)));
  const note = String(formData.get("note") ?? "").slice(0, 200);
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  const expiresAt = expiresRaw
    ? new Date(`${expiresRaw}T23:59:59.999Z`).toISOString()
    : null;

  // Ensure a unique code (retry a few times on the astronomically rare clash).
  let code = generateGiftCode();
  for (let i = 0; i < 5 && (await giftCodeRepo.get(code)); i++) {
    code = generateGiftCode();
  }

  const created = await giftCodeRepo.upsert({
    code,
    tokens: Math.min(tokens, 100000),
    bucket,
    maxUses: Math.min(maxUses, 100000),
    uses: 0,
    note,
    expiresAt,
    status: "active",
    createdBy: admin.email,
    redemptions: [],
  });

  revalidatePath("/admin/gift-codes");
  return { ok: true, code: created };
}

// ── Admin: enable / disable ────────────────────────────────────────────────
export async function setGiftCodeStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const code = String(formData.get("code") ?? "");
  const status = String(formData.get("status") ?? "") as GiftStatus;
  if (!(GIFT_STATUSES as readonly string[]).includes(status)) return;
  const c = await giftCodeRepo.get(code);
  if (!c) return;
  await giftCodeRepo.upsert({ ...c, status });
  revalidatePath("/admin/gift-codes");
}

// ── Admin: delete ──────────────────────────────────────────────────────────
export async function deleteGiftCodeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const code = String(formData.get("code") ?? "");
  await giftCodeRepo.remove(code);
  revalidatePath("/admin/gift-codes");
}

// ── User: redeem ───────────────────────────────────────────────────────────
export type RedeemState =
  | { ok: true; granted: number; bucket: GiftBucket }
  | { ok: false; error: string }
  | undefined;

export async function redeemGiftCodeAction(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const user = await requireOnboarded();
  const input = String(formData.get("code") ?? "").trim();
  if (!input) return { ok: false, error: "コードを入力してください。" };

  const code = await giftCodeRepo.get(input);
  const now = new Date().toISOString();
  const err = redeemableFor(code, user.id, now);
  if (err || !code) {
    return { ok: false, error: REDEEM_ERROR_MESSAGE[err ?? "not_found"] };
  }

  const granted = code.tokens;
  const nextUser =
    code.bucket === "bonus"
      ? { ...user, bonusTokens: user.bonusTokens + granted }
      : { ...user, tokenBalance: user.tokenBalance + granted };
  await userRepo.upsert(nextUser);

  await giftCodeRepo.upsert({
    ...code,
    uses: code.uses + 1,
    redemptions: [
      ...code.redemptions,
      { userId: user.id, email: user.email, tokens: granted, at: now },
    ],
  });

  revalidatePath("/account");
  return { ok: true, granted, bucket: code.bucket };
}
