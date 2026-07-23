/**
 * 持ち込みスキャン受付（Phase 1）— pure な zod スキーマ + 型 + ラベル定数。
 * `server-only` を import しないこと（schemas.ts と同じ理由: client component /
 * サーバーアクション両方から安全に import できる必要がある）。
 *
 * 事業背景: 撮影者が持ち込んだスキャン/CGデータを、当社（ロケハン3D）が
 * 施設側と権利交渉して販売可否を決める受付基盤。成立するまでは「非公開預かり」
 * が安全装置（無断スキャンを先に公開してから交渉する形は施設の信頼を壊す）。
 * そのため申請時に受け取るのは概要とサンプル画像のみで、フルデータそのものは
 * 受け取らない（R2バケットが公開設定のままという既知の課題があるため、価値ある
 * フルデータをここに置かない2段階方式）。フルデータの受け渡しは審査通過後に
 * 当社から個別案内する。
 *
 * 永続化（D1/ローカルJSON）は scan-submissions-repo.ts（server-only）側。
 */
import { z } from "zod";
import { PROPERTY_CATEGORIES, type PropertyCategory } from "./schemas";

export const SCAN_SUBMISSION_STATUSES = [
  "submitted",
  "reviewing",
  "clearing",
  "cleared",
  "rejected",
] as const;
export type ScanSubmissionStatus = (typeof SCAN_SUBMISSION_STATUSES)[number];

export const SCAN_STATUS_LABEL: Record<ScanSubmissionStatus, string> = {
  submitted: "申請済み",
  reviewing: "審査中",
  clearing: "権利調整中",
  cleared: "成立",
  rejected: "見送り",
};

export const SCAN_STATUS_LABEL_EN: Record<ScanSubmissionStatus, string> = {
  submitted: "Submitted",
  reviewing: "Under review",
  clearing: "Negotiating rights",
  cleared: "Cleared",
  rejected: "Not proceeding",
};

export function scanStatusLabel(status: ScanSubmissionStatus, locale?: string): string {
  return locale === "en" ? SCAN_STATUS_LABEL_EN[status] : SCAN_STATUS_LABEL[status];
}

export const scanSampleImageSchema = z.object({
  src: z.string().max(2000).default(""),
  alt: z.string().max(200).default(""),
});
export type ScanSampleImage = z.infer<typeof scanSampleImageSchema>;

export const scanSubmissionSchema = z.object({
  id: z.string(),
  /** 申請者（サインイン必須）。 */
  userId: z.string(),

  locationName: z.string().max(120).default(""),
  prefecture: z.string().max(20).default(""),
  city: z.string().max(60).default(""),
  // 既存物件のカテゴリ語彙をそのまま流用（成立時に物件へ引き写すため揃えておく）。
  category: z.enum(PROPERTY_CATEGORIES).default("studio"),
  /** 空間の説明・撮影範囲。 */
  description: z.string().max(4000).default(""),

  captureDevice: z.string().max(120).default(""),
  /** "YYYY-MM" 形式（撮影年月）。 */
  capturedAt: z.string().max(7).default(""),
  /** 施設の連絡先（分かれば任意）。 */
  facilityContact: z.string().max(300).default(""),

  /** サンプル画像（最大5枚）。フルデータそのものはここに置かない。 */
  sampleImages: z.array(scanSampleImageSchema).max(5).default([]),
  /** 外部共有リンク（ギガファイル便等）。任意。 */
  dataLink: z.string().max(500).default(""),

  status: z.enum(SCAN_SUBMISSION_STATUSES).default("submitted"),
  /** 運営メモ。 */
  adminNote: z.string().max(4000).default(""),
  /** 成立時に作成した物件下書きのID。未作成なら null。 */
  createdPropertyId: z.string().nullable().default(null),

  /** 同意チェックを行った日時（ISO・必須）。 */
  agreedAt: z.string(),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type ScanSubmission = z.infer<typeof scanSubmissionSchema>;
export type { PropertyCategory };
