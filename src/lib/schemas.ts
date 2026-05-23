import { z } from "zod";

export const PROPERTY_CATEGORIES = [
  "studio",
  "warehouse",
  "house",
  "shop",
  "outdoor",
] as const;

export const PROPERTY_STATUSES = ["draft", "published", "archived"] as const;

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

export const propertySchema = z.object({
  id: z.string().min(1),
  status: z.enum(PROPERTY_STATUSES).default("draft"),

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
  summary: z.string().max(200, "200 文字以内で入力してください").default(""),

  // 2. Specs
  capacity: z.number().int().min(0).max(9999).default(0),
  floorAreaSqm: z.number().min(0).max(99999).default(0),
  ceilingHeightM: z.number().min(0).max(50).default(0),
  hasNaturalLight: z.boolean().default(false),
  parking: z.boolean().default(false),
  loadingDock: z.boolean().default(false),
  tags: z.array(z.string().min(1).max(20)).max(20).default([]),

  // 3. Description
  description: z.string().max(4000).default(""),

  // 4. Photos
  cover: propertyImageSchema,
  gallery: z.array(propertyImageSchema).max(40).default([]),

  // 5. 3DGS
  splatUrl: z.string().url("URL 形式で入力してください").or(z.literal("")),
  splatSizeMb: z.number().min(0).max(99999).default(0),
  scannedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD で入力してください")
    .or(z.literal("")),
  annotations: z.array(annotationSchema).max(200).default([]),

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

export const ANNOTATION_LABEL: Record<AnnotationKind, string> = {
  event: "イベント",
  parking: "駐車枠",
  loading: "搬入動線",
  measurement: "採寸",
};
