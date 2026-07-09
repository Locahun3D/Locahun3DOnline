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

  const now = new Date().toISOString();

  // 1) コードを原子的に確定（claim）。D1 の条件付き UPDATE（楽観ロック）で
  //    二重引換 / maxUses 超過 / 同時クリックを真に防ぐ。dev は read-modify-write。
  const claim = await giftCodeRepo.claim(input, {
    userId: user.id,
    email: user.email,
    at: now,
  });
  if (!claim.ok) {
    return { ok: false, error: REDEEM_ERROR_MESSAGE[claim.error] };
  }
  const granted = claim.code.tokens;

  // 2) ユーザーへ付与。read-modify-write の単純な upsert だと、同一ユーザーが
  //    2つの異なるギフトコードをほぼ同時に引き換えた際、片方の加算が後勝ちで
  //    消える lost-update が起き得る。grantTokens は D1 の楽観ロックで読取り→
  //    条件付きUPDATE→競合時再試行を行い、これを防ぐ。
  const nextUser = await userRepo.grantTokens(user.id, (u) =>
    claim.code.bucket === "bonus"
      ? { ...u, bonusTokens: u.bonusTokens + granted }
      : {
          ...u,
          tokenBalance: u.tokenBalance + granted,
          // 通常トークンは付与から1年で失効。
          tokenExpiresAt: oneYearFrom(now),
        },
  );
  if (!nextUser) {
    return {
      ok: false,
      error: "コードは有効でしたが、トークン付与に失敗しました。もう一度お試しください。",
    };
  }

  revalidatePath("/account");
  return { ok: true, granted, bucket: claim.code.bucket };
}
