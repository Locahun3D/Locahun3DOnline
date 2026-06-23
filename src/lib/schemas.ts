import { z } from "zod";

export const PROPERTY_CATEGORIES = [
  "studio",
  "warehouse",
  "house",
  "shop",
  "outdoor",
] as const;

export const PROPERTY_STATUSES = ["draft", "published", "archived"] as const;

/**
 * Listing visibility:
 *   public        — anyone can see it in the catalog and open the detail page.
 *   confidential  — only NDA-signed production accounts (and admins) can see it.
 *                   倉庫裏・非公開スタジオ等。カタログにも出さない。
 */
export const PROPERTY_VISIBILITIES = ["public", "confidential"] as const;

export const ANNOTATION_KINDS = [
  "event",
  "parking",
  "loading",
  "measurement",
] as const;

// Draft-permissive image: src can be empty (placeholder), alt optional.
export const propertyImageSchema = z.object({
  src: z
    .string()
    .max(2000)
    .refine((s) => s === "" || /^https?:\/\//.test(s), {
      message: "URL 形式で入力してください",
    })
    .default(""),
  alt: z.string().max(200).default(""),
  width: z.number().int().positive().default(1600),
  height: z.number().int().positive().default(1000),
});

export const annotationSchema = z.object({
  id: z.string(),
  kind: z.enum(ANNOTATION_KINDS),
  label: z.string().min(1).max(40),
  note: z.string().max(500).optional().default(""),
  // 3D coordinates — placement UI is Phase 2. For now stored as optional.
  position: z
    .object({ x: z.number(), y: z.number(), z: z.number() })
    .optional(),
});

// ── Studio page builder blocks ───────────────────────────────
// The public studio page (/properties/[id]) can be composed from an ordered
// list of blocks. Some blocks (gallery/splat/specs) pull from the property
// record itself; others (heading/text/image/cta) carry their own content.
export const PAGE_BLOCK_KINDS = [
  "heading",
  "text",
  "image",
  "gallery",
  "splat",
  "specs",
  "cta",
  "divider",
] as const;
export type PageBlockKind = (typeof PAGE_BLOCK_KINDS)[number];

const blockBase = { id: z.string().min(1) };

export const pageBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    ...blockBase,
    kind: z.literal("heading"),
    eyebrow: z.string().max(40).default(""),
    text: z.string().max(120).default(""),
  }),
  z.object({
    ...blockBase,
    kind: z.literal("text"),
    body: z.string().max(6000).default(""),
  }),
  z.object({
    ...blockBase,
    kind: z.literal("image"),
    src: z.string().max(2000).default(""),
    alt: z.string().max(200).default(""),
    caption: z.string().max(200).default(""),
  }),
  z.object({ ...blockBase, kind: z.literal("gallery") }),
  z.object({
    ...blockBase,
    kind: z.literal("splat"),
    caption: z.string().max(200).default(""),
  }),
  z.object({ ...blockBase, kind: z.literal("specs") }),
  z.object({
    ...blockBase,
    kind: z.literal("cta"),
    label: z.string().max(40).default("見積もり依頼"),
    href: z.string().max(300).default("/pricing"),
    note: z.string().max(200).default(""),
  }),
  z.object({ ...blockBase, kind: z.literal("divider") }),
]);
export type PageBlock = z.infer<typeof pageBlockSchema>;

export const PAGE_BLOCK_LABEL: Record<PageBlockKind, string> = {
  heading: "見出し",
  text: "本文",
  image: "画像",
  gallery: "写真ギャラリー",
  splat: "3DGS ビューアー",
  specs: "スペック表",
  cta: "CTA ボタン",
  divider: "区切り線",
};

export const propertySchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().default(""),
  status: z.enum(PROPERTY_STATUSES).default("draft"),
  visibility: z.enum(PROPERTY_VISIBILITIES).default("public"),

  // 1. Basic (draft-permissive — strictness applied in publishablePropertySchema)
  title: z.string().max(120).default(""),
  category: z.enum(PROPERTY_CATEGORIES),
  area: z.string().max(40).default(""),
  prefecture: z.string().max(20).default(""),
  city: z.string().max(40).default(""),
  hourlyPrice: z
    .number({ message: "数値で入力してください" })
    .int()
    .min(0, "0 以上で入力してください")
    .max(9999999)
    .default(0),
  /** Daily rate in JPY. 0 means "not offered as a daily plan" — only hourly. */
  dailyPrice: z
    .number({ message: "数値で入力してください" })
    .int()
    .min(0)
    .max(99999999)
    .default(0),
  summary: z.string().max(200, "200 文字以内で入力してください").default(""),

  // 1.5 — Studio kind (subdivides `category`, free-text with suggestions)
  studioType: z.string().max(40).default(""),

  // 1.6 — Geographic coordinates (for map placement and distance calc)
  coords: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable()
    .default(null),

  // 2. Specs
  capacity: z.number().int().min(0).max(9999).default(0),
  floorAreaSqm: z.number().min(0).max(99999).default(0),
  ceilingHeightM: z.number().min(0).max(50).default(0),
  powerVoltage: z.string().max(80).default(""),
  hasNaturalLight: z.boolean().default(false),
  parking: z.boolean().default(false),
  loadingDock: z.boolean().default(false),
  tags: z.array(z.string().min(1).max(20)).max(20).default([]),

  // 2.5 Contact — property-level contact info (overrides account-level)
  contactWebsite: z.string().max(300).default(""),
  contactPhone: z.string().max(40).default(""),
  contactEmail: z.string().max(120).default(""),

  // 2.6 Blueprints / floor plans
  blueprints: z.array(z.object({
    label: z.string().max(60).default(""),
    url: z.string().url("URL 形式で入力してください").or(z.literal("")).default(""),
  })).max(10).default([]),

  // 3. Description
  description: z.string().max(4000).default(""),

  // 4. Photos
  cover: propertyImageSchema,
  gallery: z.array(propertyImageSchema).max(40).default([]),

  // 5. 3DGS
  splatUrl: z.string().url("URL 形式で入力してください").or(z.literal("")).default(""),
  zipUrl: z.string().url("URL 形式で入力してください").or(z.literal("")).default(""),
  zipSizeMb: z.number().min(0).max(99999).default(0),
  splatSizeMb: z.number().min(0).max(99999).default(0),
  splatItems: z.array(z.object({
    label: z.string().max(60).default(""),
    splatUrl: z.string().url("URL 形式で入力してください").or(z.literal("")).default(""),
    previewVideoUrl: z.string().url().or(z.literal("")).default(""),
    sizeMb: z.number().min(0).max(99999).default(0),
    notes: z.string().max(500).default(""),
    forSale: z.boolean().default(false),
    salePrice: z.number().int().min(0).max(99999999).default(0),
    saleDescription: z.string().max(1000).default(""),
  })).max(20).default([]),
  splatNotes: z.string().max(2000).default(""),
  scannedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD で入力してください")
    .or(z.literal(""))
    .default(""),
  splatDataUpdatedAt: z.string().datetime().or(z.literal("")).default(""),
  /**
   * Token cost for one 3DGS walkthrough viewing.
   *   1 = ハウススタジオ / 小規模 (≤ 150㎡ 目安)
   *   2 = 中規模スタジオ (150-400㎡ 目安)
   *   3 = ドーム / 大規模 / 屋外 (400㎡ 超 or 複雑な空間)
   * Subscription plans grant a monthly token budget; Free gives 1 walk-through
   * irrespective of cost.
   */
  tokenCost: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  annotations: z.array(annotationSchema).max(200).default([]),

  // Data sale fields moved to splatItems[].forSale/salePrice/saleDescription

  // 6. Studio page builder — ordered content blocks for the public page.
  //    Empty = render the default detail layout (no regression).
  pageBlocks: z.array(pageBlockSchema).max(60).default([]),

  // Meta
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

/**
 * Schema used when publishing — re-validates with stricter rules.
 * All "required for publish" fields are enforced here, not in the draft schema.
 */
export const publishablePropertySchema = propertySchema.extend({
  title: z
    .string()
    .min(2, "タイトルは 2 文字以上で入力してください")
    .max(120),
  area: z.string().min(1, "エリアを入力してください").max(40),
  prefecture: z.string().min(1, "都道府県を入力してください").max(20),
  city: z.string().min(1, "市区町村を入力してください").max(40),
  hourlyPrice: z.number().int().min(1, "料金を入力してください"),
  summary: z
    .string()
    .min(10, "10 文字以上で入力してください")
    .max(200),
  splatUrl: z.string().url({ message: "公開には 3DGS の URL が必須です" }),
  cover: propertyImageSchema.extend({
    src: z
      .string()
      .url({ message: "公開にはカバー画像が必須です" }),
    alt: z.string().min(1, "カバー画像の代替テキストを入力してください"),
  }),
});

export type Property = z.infer<typeof propertySchema>;
export type PropertyImage = z.infer<typeof propertyImageSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type PropertyCategory = (typeof PROPERTY_CATEGORIES)[number];
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type PropertyVisibility = (typeof PROPERTY_VISIBILITIES)[number];
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export const CATEGORY_LABEL: Record<PropertyCategory, string> = {
  studio: "スタジオ",
  warehouse: "倉庫",
  house: "住宅",
  shop: "店舗",
  outdoor: "屋外",
};

export const STATUS_LABEL: Record<PropertyStatus, string> = {
  draft: "下書き",
  published: "公開中",
  archived: "アーカイブ",
};

export const VISIBILITY_LABEL: Record<PropertyVisibility, string> = {
  public: "一般公開",
  confidential: "機密（NDA限定）",
};

export const ANNOTATION_LABEL: Record<AnnotationKind, string> = {
  event: "イベント",
  parking: "駐車枠",
  loading: "搬入動線",
  measurement: "採寸",
};

/** Suggested studio types — used by the editor as a datalist, not enforced. */
export const STUDIO_TYPE_SUGGESTIONS = [
  "ハウススタジオ",
  "白ホリゾント",
  "黒ホリゾント",
  "ガレージ",
  "倉庫",
  "オフィス",
  "一軒家",
  "マンション / レジデンス",
  "商業店舗",
  "カフェ / レストラン",
  "屋外 / ロケ地",
  "工場",
  "その他",
] as const;

/** Token cost labels and per-plan monthly budgets. */
export const TOKEN_COST_LABEL: Record<1 | 2 | 3, string> = {
  1: "ハウス / 小規模",
  2: "中規模スタジオ",
  3: "ドーム / 大規模",
};

/** Monthly recurring token budget per plan (resets on the 1st). */
export const PLAN_TOKEN_BUDGET = {
  free: 0,       // free has no monthly budget — only the signup bonus below
  individual: 8,
  studio: 12,
  team: 30,
} as const;

/** One-time bonus tokens granted at account creation. Currently only used by Free. */
export const SIGNUP_BONUS_TOKENS = 1;

/** 3DGS data resale price by size class (per scan; "ドーム" is per zone/区画). */
export const DATA_SALE_PRICE: Record<1 | 2 | 3, number> = {
  1: 100_000,
  2: 250_000,
  3: 300_000, // per 区画
};

/** Reference location presets for the catalog "from X km" feature. */
export const REFERENCE_PRESETS = [
  { id: "shibuya",   label: "渋谷駅",   lat: 35.6580, lng: 139.7016 },
  { id: "shinjuku",  label: "新宿駅",   lat: 35.6896, lng: 139.7006 },
  { id: "tokyo",     label: "東京駅",   lat: 35.6812, lng: 139.7671 },
  { id: "roppongi",  label: "六本木駅", lat: 35.6628, lng: 139.7314 },
  { id: "kichijoji", label: "吉祥寺駅", lat: 35.7028, lng: 139.5800 },
  { id: "yokohama",  label: "横浜駅",   lat: 35.4660, lng: 139.6225 },
  { id: "osaka",     label: "大阪駅",   lat: 34.7024, lng: 135.4959 },
] as const;

export type ReferencePresetId = (typeof REFERENCE_PRESETS)[number]["id"];

// ─── Asset library ───────────────────────────────────────────────
export const assetKindSchema = z.enum(["image", "splat", "zip", "document"]);
export const assetStatusSchema = z.enum(["uploading", "ready"]);

export const assetSchema = z.object({
  id: z.string(),
  kind: assetKindSchema,
  status: assetStatusSchema.default("ready"),
  label: z.string().max(120).default(""),
  filename: z.string().default(""),
  ext: z.string().default(""),
  r2Key: z.string().default(""),
  url: z.string().default(""),
  size: z.number().int().min(0).default(0),
  contentType: z.string().default("application/octet-stream"),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
  uploadedAt: z.string().default(() => new Date().toISOString()),
});

export type AssetKind = z.infer<typeof assetKindSchema>;
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export type Asset = z.infer<typeof assetSchema>;
