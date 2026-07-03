import { z } from "zod";

export const PROPERTY_CATEGORIES = [
  "studio",
  "warehouse",
  "house",
  "school",
  "shop",
  "outdoor",
  "venue",
] as const;

export const PROPERTY_STATUSES = ["draft", "published", "archived"] as const;

/**
 * Listing visibility:
 *   public        — anyone can see it in the catalog and open the detail page.
 *   confidential  — only NDA-signed production accounts (and admins) can see it.
 *                   倉庫裏・非公開スタジオ等。カタログにも出さない。
 */
export const PROPERTY_VISIBILITIES = ["public", "confidential"] as const;

/**
 * Per-splatItem access level:
 *   public     — anyone with a subscription can view this 3DGS file
 *   restricted — only production accounts with Team plan can view
 *                (バックヤード・搬入口・制御室・ライブ会場バックステージ・ドーム機材エリア等)
 *   nda_only   — NDA 締結済み制作会社のみ（ドーム/アリーナの詳細構造・天井リギング等）
 */
export const SPLAT_ACCESS_LEVELS = ["public", "restricted", "nda_only"] as const;
export type SplatAccessLevel = (typeof SPLAT_ACCESS_LEVELS)[number];

export const SPLAT_ACCESS_LABEL: Record<SplatAccessLevel, string> = {
  public: "制限なし（一般公開）",
  restricted: "制限あり（制作会社 Team プラン限定）",
  nda_only: "NDA 限定（機密構造・リギング情報を含む）",
};

// 3Dデータ販売ライセンス（TurboSquid風）
export const DATA_LICENSES = ["standard", "editorial", "extended", "custom"] as const;
export type DataLicense = (typeof DATA_LICENSES)[number];

export const DATA_LICENSE_LABEL: Record<DataLicense, string> = {
  standard: "標準ライセンス",
  editorial: "エディトリアル限定",
  extended: "拡張ライセンス",
  custom: "カスタム（要相談）",
};

export const DATA_LICENSE_DESC: Record<DataLicense, string> = {
  standard: "商用・非商用の制作物に利用可。データ自体の再配布・再販は不可。",
  editorial: "報道・教育・個人利用に限定。広告等の商用利用は不可。",
  extended: "商用利用に加え、テンプレート/組込製品への同梱・改変配布を許諾。",
  custom: "利用範囲を個別に取り決め。購入前にお問い合わせください。",
};

export const DATA_LICENSE_LABEL_EN: Record<DataLicense, string> = {
  standard: "Standard license",
  editorial: "Editorial only",
  extended: "Extended license",
  custom: "Custom (by arrangement)",
};

export const DATA_LICENSE_DESC_EN: Record<DataLicense, string> = {
  standard: "Use in commercial & non-commercial productions. Redistribution or resale of the data itself is not permitted.",
  editorial: "Limited to news, education and personal use. Commercial use such as advertising is not permitted.",
  extended: "Commercial use plus bundling into templates / embedded products and modified redistribution.",
  custom: "Scope arranged individually. Please contact us before purchasing.",
};

export function dataLicenseLabel(l: DataLicense, locale?: string): string {
  return locale === "en" ? DATA_LICENSE_LABEL_EN[l] : DATA_LICENSE_LABEL[l];
}
export function dataLicenseDesc(l: DataLicense, locale?: string): string {
  return locale === "en" ? DATA_LICENSE_DESC_EN[l] : DATA_LICENSE_DESC[l];
}

export const ANNOTATION_KINDS = [
  "event",
  "parking",
  "loading",
  "measurement",
] as const;

/**
 * Draft-permissive URL: 空 / 絶対 http(s) URL / 同一オリジンの相対パス（/uploads/...）を許可。
 * アップロード由来の相対パスを `.url()` が弾いて下書き保存が無言で失敗していたのを解消。
 */
const urlOrPath = (message = "URL またはパスで入力してください") =>
  z
    .string()
    .max(2000)
    .refine((s) => s === "" || /^https?:\/\//.test(s) || s.startsWith("/"), {
      message,
    })
    .default("");

// Draft-permissive image: src can be empty (placeholder), alt optional.
export const propertyImageSchema = z.object({
  src: z
    .string()
    .max(2000)
    .refine((s) => s === "" || /^https?:\/\//.test(s) || s.startsWith("/"), {
      message: "URL 形式で入力してください",
    })
    .default(""),
  alt: z.string().max(200).default(""),
  width: z.number().int().positive().default(1600),
  height: z.number().int().positive().default(1000),
  // トリミングの基準位置（object-position）。多様なアスペクト比の写真を
  // object-cover で切る際にどこを残すか。例: "center" / "top" / "left bottom"。
  focus: z.string().max(24).default("center"),
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

  // 2.55 Permit-required public spot (例: スクランブル交差点など、施設所有者への
  // 通常の問い合わせ先が存在せず、撮影に道路使用許可等の別手続きが必要な場所)
  permitRequired: z.boolean().default(false),
  permitNotes: z.string().max(1000).default(""),

  // 2.6 Blueprints / floor plans
  blueprints: z.array(z.object({
    label: z.string().max(60).default(""),
    url: urlOrPath(),
  })).max(10).default([]),

  // 3. Description
  description: z.string().max(4000).default(""),

  // 4. Photos
  cover: propertyImageSchema,
  gallery: z.array(propertyImageSchema).max(40).default([]),

  // 5. 3DGS
  splatUrl: urlOrPath(),
  zipUrl: urlOrPath(),
  zipSizeMb: z.number().min(0).max(99999).default(0),
  splatSizeMb: z.number().min(0).max(99999).default(0),
  splatItems: z.array(z.object({
    label: z.string().max(60).default(""),
    splatUrl: urlOrPath(),
    previewVideoUrl: urlOrPath(),
    sizeMb: z.number().min(0).max(99999).default(0),
    notes: z.string().max(500).default(""),
    forSale: z.boolean().default(false),
    salePrice: z.number().int().min(0).max(99999999).default(0),
    saleDescription: z.string().max(1000).default(""),
    accessLevel: z.enum(SPLAT_ACCESS_LEVELS).default("public"),
    // 販売用ダウンロードファイル（PLY & OBJ の ZIP）— ビューアー用 splatUrl とは別
    downloadFileUrl: urlOrPath(),
    downloadFileSizeMb: z.number().min(0).max(99999).default(0),
    downloadFileFormat: z.string().max(40).default("PLY & OBJ (ZIP)"),
    // TurboSquid風マルチ形式DL: 1購入で複数形式を個別ダウンロード可能にする。
    // 空なら上の downloadFileUrl を単一形式としてフォールバック扱い。
    downloadFiles: z.array(z.object({
      format: z.string().max(40).default(""),
      url: urlOrPath(),
      sizeMb: z.number().min(0).max(99999).default(0),
    })).max(10).default([]),
    // 商品スペック（TurboSquid風）
    pointCount: z.number().min(0).max(99999999999).default(0),
    captureDevice: z.string().max(80).default(""),
    // 販売ライセンス区分
    license: z.enum(DATA_LICENSES).default("standard"),
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
    .min(10, "紹介文は 10 文字以上で入力してください")
    .max(200),
  cover: propertyImageSchema.extend({
    src: z
      .string()
      .min(1, "公開にはカバー画像が必須です")
      .refine((s) => /^https?:\/\//.test(s) || s.startsWith("/"), {
        message: "公開にはカバー画像が必須です",
      }),
    alt: z.string().min(1, "カバー画像の代替テキストを入力してください"),
  }),
}).superRefine((data, ctx) => {
  // 3DGS は「レガシーの splatUrl」または「splatItems のいずれか」にあれば公開可。
  // （現行エディタは splatItems[] に登録するため、トップレベル splatUrl 必須の
  //   旧チェックだと、3DGS が登録済みでも誤って公開をブロックしていた。）
  const validUrl = (s: string | undefined | null) =>
    !!s && (/^https?:\/\//.test(s) || s.startsWith("/"));
  const hasSplat =
    validUrl(data.splatUrl) ||
    (data.splatItems ?? []).some((it) => validUrl(it.splatUrl));
  if (!hasSplat) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["splatUrl"],
      message: "公開には 3DGS データが必須です（STEP 05 でアップロード）",
    });
  }
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
  school: "学校",
  shop: "店舗",
  outdoor: "屋外",
  venue: "会場 / ドーム",
};

export const CATEGORY_LABEL_EN: Record<PropertyCategory, string> = {
  studio: "Studio",
  warehouse: "Warehouse",
  house: "House",
  school: "School",
  shop: "Shop",
  outdoor: "Outdoor",
  venue: "Venue / Dome",
};

/** locale-aware カテゴリ名。locale="en" で英語、それ以外は日本語。 */
export function categoryLabel(cat: PropertyCategory, locale?: string): string {
  return locale === "en" ? CATEGORY_LABEL_EN[cat] : CATEGORY_LABEL[cat];
}

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
  "ライブ会場 / ホール",
  "ドーム / アリーナ",
  "コンベンションセンター",
  "劇場 / シアター",
  "その他",
] as const;

/** Suggested areas — editor select の候補（自由入力も可）。 */
export const AREA_SUGGESTIONS = [
  "東京23区",
  "東京西エリア",
  "神奈川エリア",
  "千葉エリア",
  "埼玉エリア",
  "茨城エリア",
  "栃木・群馬エリア",
  "中部・東海エリア",
  "関西エリア",
  "その他",
] as const;

/** Token cost labels and per-plan monthly budgets. */
export const TOKEN_COST_LABEL: Record<1 | 2 | 3, string> = {
  1: "ハウス / 小規模",
  2: "中規模スタジオ",
  3: "ドーム / 大規模",
};

export const TOKEN_COST_LABEL_EN: Record<1 | 2 | 3, string> = {
  1: "House / small",
  2: "Mid-size studio",
  3: "Dome / large",
};

export function tokenCostLabel(t: 1 | 2 | 3, locale?: string): string {
  return locale === "en" ? TOKEN_COST_LABEL_EN[t] : TOKEN_COST_LABEL[t];
}

/** Monthly recurring token budget per plan (resets on the 1st). */
export const PLAN_TOKEN_BUDGET = {
  free: 0,       // free has no monthly budget — only the signup bonus below
  individual: 24,
  studio: 36,
  team: 90,
} as const;

/** One-time bonus tokens granted at account creation. Currently only used by Free. */
export const SIGNUP_BONUS_TOKENS = 6;

/** 3DGS data resale price by size class (per scan; "ドーム" is per zone/区画). */
export const DATA_SALE_PRICE: Record<1 | 2 | 3, number> = {
  1: 100_000,
  2: 250_000,
  3: 300_000, // per 区画
};

/** Reference location presets for the catalog "from X km" feature. */
export const REFERENCE_PRESETS = [
  { id: "shibuya",   label: "渋谷駅",   labelEn: "Shibuya Sta.",   lat: 35.6580, lng: 139.7016 },
  { id: "shinjuku",  label: "新宿駅",   labelEn: "Shinjuku Sta.",  lat: 35.6896, lng: 139.7006 },
  { id: "tokyo",     label: "東京駅",   labelEn: "Tokyo Sta.",     lat: 35.6812, lng: 139.7671 },
  { id: "roppongi",  label: "六本木駅", labelEn: "Roppongi Sta.",  lat: 35.6628, lng: 139.7314 },
  { id: "kichijoji", label: "吉祥寺駅", labelEn: "Kichijoji Sta.", lat: 35.7028, lng: 139.5800 },
  { id: "yokohama",  label: "横浜駅",   labelEn: "Yokohama Sta.",  lat: 35.4660, lng: 139.6225 },
  { id: "osaka",     label: "大阪駅",   labelEn: "Osaka Sta.",     lat: 34.7024, lng: 135.4959 },
] as const;

export type ReferencePresetId = (typeof REFERENCE_PRESETS)[number]["id"];

/** locale 対応の参照地点ラベル。プリセット id 一致時のみ。 */
export function presetLabel(id: string, locale?: string): string | null {
  const p = REFERENCE_PRESETS.find((r) => r.id === id);
  if (!p) return null;
  return locale === "en" ? p.labelEn : p.label;
}

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
  thumbnailUrl: z.string().default(""),
  tags: z.array(z.string().max(40)).default([]),
  uploadedAt: z.string().default(() => new Date().toISOString()),
});

export type AssetKind = z.infer<typeof assetKindSchema>;
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export type Asset = z.infer<typeof assetSchema>;
