/**
 * Gift code schema — PURE (no server-only / node imports), safe for client.
 * Admin issues a code worth N tokens; a user redeems it to receive them.
 * Tokens land in one of two buckets (failure-mode mirrors the user record):
 *   bonus   — 失効しない貢献枠 (bonusTokens)
 *   balance — 通常トークン / 1年失効 (tokenBalance)
 */
import { z } from "zod";

export const GIFT_BUCKETS = ["bonus", "balance"] as const;
export type GiftBucket = (typeof GIFT_BUCKETS)[number];

export const GIFT_BUCKET_LABEL: Record<GiftBucket, string> = {
  bonus: "失効しない貢献枠",
  balance: "通常トークン（1年失効）",
};

export const GIFT_STATUSES = ["active", "disabled"] as const;
export type GiftStatus = (typeof GIFT_STATUSES)[number];

export const giftRedemptionSchema = z.object({
  userId: z.string(),
  email: z.string(),
  tokens: z.number().int(),
  at: z.string(),
});
export type GiftRedemption = z.infer<typeof giftRedemptionSchema>;

export const giftCodeSchema = z.object({
  /** Canonical code, e.g. "LH3D-7QX4-K2M9" (uppercase, hyphenated). */
  code: z.string().min(4).max(40),
  tokens: z.number().int().min(1).max(100000),
  bucket: z.enum(GIFT_BUCKETS).default("bonus"),
  /** How many distinct users may redeem this code. */
  maxUses: z.number().int().min(1).max(100000).default(1),
  uses: z.number().int().min(0).default(0),
  note: z.string().max(200).default(""),
  /** ISO timestamp; null = no expiry. */
  expiresAt: z.string().nullable().default(null),
  status: z.enum(GIFT_STATUSES).default("active"),
  createdBy: z.string().default(""),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  redemptions: z.array(giftRedemptionSchema).default([]),
});
export type GiftCode = z.infer<typeof giftCodeSchema>;

/** Normalize for comparison: uppercase, strip everything but A–Z/0–9. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type RedeemError =
  | "not_found"
  | "disabled"
  | "expired"
  | "exhausted"
  | "already";

export const REDEEM_ERROR_MESSAGE: Record<RedeemError, string> = {
  not_found: "コードが見つかりません。入力を確認してください。",
  disabled: "このコードは無効化されています。",
  expired: "このコードは有効期限が切れています。",
  exhausted: "このコードは使用上限に達しています。",
  already: "このコードはすでに引き換え済みです。",
};

/** Returns null if redeemable for this user now, else the reason. */
export function redeemableFor(
  code: GiftCode | null,
  userId: string,
  nowIso: string,
): RedeemError | null {
  if (!code) return "not_found";
  if (code.status !== "active") return "disabled";
  if (code.expiresAt && code.expiresAt < nowIso) return "expired";
  if (code.uses >= code.maxUses) return "exhausted";
  if (code.redemptions.some((r) => r.userId === userId)) return "already";
  return null;
}
