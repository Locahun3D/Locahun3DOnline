"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireOnboarded } from "./dal";
import { userRepo } from "./users";
import { oneYearFrom } from "./account-schema";
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

  // 競合防止（二重引換 / maxUses 超過 / 同時クリック）: 付与の直前にコードを
  // 再取得して再検証し、先にコードの uses を確定(claim)してからトークンを付与する。
  // 完全な原子性には D1 等の CAS が必要だが、再取得＋claim-first で実害ケース
  // （同一ユーザーの連打・maxUses=1 の同時利用）を大幅に抑止する。
  const fresh = await giftCodeRepo.get(input);
  const err2 = redeemableFor(fresh, user.id, now);
  if (err2 || !fresh) {
    return { ok: false, error: REDEEM_ERROR_MESSAGE[err2 ?? "not_found"] };
  }
  const granted = fresh.tokens;

  // 1) 使用回数を先に確定（コードを claim）
  await giftCodeRepo.upsert({
    ...fresh,
    uses: fresh.uses + 1,
    redemptions: [
      ...fresh.redemptions,
      { userId: user.id, email: user.email, tokens: granted, at: now },
    ],
  });

  // 2) ユーザーへ付与
  const nextUser =
    fresh.bucket === "bonus"
      ? { ...user, bonusTokens: user.bonusTokens + granted }
      : {
          ...user,
          tokenBalance: user.tokenBalance + granted,
          // 通常トークンは付与から1年で失効。
          tokenExpiresAt: oneYearFrom(now),
        };
  await userRepo.upsert(nextUser);

  revalidatePath("/account");
  return { ok: true, granted, bucket: fresh.bucket };
}
