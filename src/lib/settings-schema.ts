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

/** 3Dデータ販売の無料期間終了後、どう振る舞うか。 */
export const AFTER_FREE_PERIOD_ACTIONS = [
  "revert_to_price",
  "stay_free",
  "disable_sales",
] as const;
export type AfterFreePeriodAction = (typeof AFTER_FREE_PERIOD_ACTIONS)[number];

export const AFTER_FREE_PERIOD_LABEL: Record<AfterFreePeriodAction, string> = {
  revert_to_price: "通常価格に戻す",
  stay_free: "そのまま無料配布を続ける",
  disable_sales: "販売自体を停止する",
};

/**
 * 3Dデータ販売専用の無料期間。3DGSウォークスルー閲覧用の freePeriod とは
 * 別物（購入・ダウンロードの対象）。過去キャンペーンの履歴は保持しない —
 * この1レコードが「現在の設定」を表すのみで、終了後の挙動(afterEnd)も
 * 都度この設定から導出する（別テーブルでのログ管理はしない）。
 */
export const dataSaleFreePeriodSchema = z.object({
  enabled: z.boolean().default(false),
  startAt: z.string().nullable().default(null),
  endAt: z.string().nullable().default(null),
  note: z.string().max(200).default(""),
  afterEnd: z.enum(AFTER_FREE_PERIOD_ACTIONS).default("revert_to_price"),
});
export type DataSaleFreePeriod = z.infer<typeof dataSaleFreePeriodSchema>;

export const siteSettingsSchema = z.object({
  version: z.literal(1).default(1),
  freePeriod: freePeriodSchema.default({
    enabled: false,
    startAt: null,
    endAt: null,
    note: "",
  }),
  dataSaleFreePeriod: dataSaleFreePeriodSchema.default({
    enabled: false,
    startAt: null,
    endAt: null,
    note: "",
    afterEnd: "revert_to_price",
  }),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const DEFAULT_SETTINGS: SiteSettings = {
  version: 1,
  freePeriod: { enabled: false, startAt: null, endAt: null, note: "" },
  dataSaleFreePeriod: {
    enabled: false,
    startAt: null,
    endAt: null,
    note: "",
    afterEnd: "revert_to_price",
  },
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

/**
 * 3Dデータ販売の無料期間の現在の状態。
 * - "off": 無効(enabled=false)。常に通常価格。
 * - "pending": 有効だが開始日前。まだ通常価格。
 * - "active": 期間中。¥0。
 * - "concluded": 有効で終了日を過ぎた。afterEnd の設定に従う。
 */
export function dataSalePeriodStatus(
  fp: DataSaleFreePeriod | undefined | null,
  nowIso: string,
): "off" | "pending" | "active" | "concluded" {
  if (!fp || !fp.enabled) return "off";
  if (fp.startAt && nowIso < fp.startAt) return "pending";
  if (fp.endAt && nowIso > fp.endAt) return "concluded";
  return "active";
}

/** この設定のもとで、3Dデータ購入が今¥0になるか。 */
export function isDataSaleFree(
  fp: DataSaleFreePeriod | undefined | null,
  nowIso: string,
): boolean {
  const status = dataSalePeriodStatus(fp, nowIso);
  if (status === "active") return true;
  if (status === "concluded" && fp?.afterEnd === "stay_free") return true;
  return false;
}

/** この設定のもとで、3Dデータ販売自体を止めるべきか（パネル非表示）。 */
export function isDataSaleDisabled(
  fp: DataSaleFreePeriod | undefined | null,
  nowIso: string,
): boolean {
  const status = dataSalePeriodStatus(fp, nowIso);
  return status === "concluded" && fp?.afterEnd === "disable_sales";
}
