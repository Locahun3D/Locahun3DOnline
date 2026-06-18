/**
 * Site-wide settings — PURE (no server-only / node imports), safe for client.
 * 限定無料期間 (free campaign window): while active, every 3DGS walkthrough is
 * viewable with no token consumption, regardless of plan.
 */
import { z } from "zod";

export const freePeriodSchema = z.object({
  enabled: z.boolean().default(false),
  /** ISO timestamps; null = open-ended on that side. */
  startAt: z.string().nullable().default(null),
  endAt: z.string().nullable().default(null),
  note: z.string().max(200).default(""),
});
export type FreePeriod = z.infer<typeof freePeriodSchema>;

export const siteSettingsSchema = z.object({
  version: z.literal(1).default(1),
  freePeriod: freePeriodSchema.default({
    enabled: false,
    startAt: null,
    endAt: null,
    note: "",
  }),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const DEFAULT_SETTINGS: SiteSettings = {
  version: 1,
  freePeriod: { enabled: false, startAt: null, endAt: null, note: "" },
};

/** Is the free period active at `nowIso`? */
export function isFreePeriodActive(
  fp: FreePeriod | undefined | null,
  nowIso: string,
): boolean {
  if (!fp || !fp.enabled) return false;
  if (fp.startAt && nowIso < fp.startAt) return false;
  if (fp.endAt && nowIso > fp.endAt) return false;
  return true;
}
