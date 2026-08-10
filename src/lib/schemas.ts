import { z } from "zod";
import { dataSaleFreePeriodSchema } from "./settings-schema";

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

// 3Dデータ販売ライセンス（TurboSquid風）。グレード順（利用範囲が狭い→広い順）で
// 並べる: editorial(報道・教育・個人限定) < standard(商用可・再配布不可) <
// extended(同梱・改変配布まで許諾) < custom(個別合意)。この配列順が
// license-options.ts のソート・管理画面のチェックボックス/既定選択プルダウンの
// 表示順すべてに反映される。
export const DATA_LICENSES = ["editorial", "standard", "extended", "custom"] as const;
export type DataLicense = (typeof DATA_LICENSES)[number];

export const DATA_LICENSE_LABEL: Record<DataLicense, string> = {
  standard: "標準ライセンス",
  editorial: "エディトリアル限定",
  extended: "拡張ライセンス",
  custom: "カスタム（要相談）",
};

export const DATA_LICENSE_DESC: Record<DataLicense, string> = {
  standard: "商用・非商用の制作物に利用可。データ自体の再配布・再販は不可。",
  editorial: "報道・教育・個人利用に限定。広告等の商用利用は不可。公開時に権利表記が必要です。",
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
  editorial: "Limited to news, education and personal use. Commercial use such as advertising is not permitted. A rights credit is required when published.",
  extended: "Commercial use plus bundling into templates / embedded products and modified redistribution.",
  custom: "Scope arranged individually. Please contact us before purchasing.",
};

/**
 * 購入画面でライセンスの違いを並べて見せるための可否表。
 *
 * ⚠ 出典は `/terms/data-download`（データ購入規約）。文言を変える時は必ず
 * 規約と一致させること。ここは規約の要約であって、規約より強い/弱い権利を
 * 与えるものではない。
 *   - 標準: 「映像・画像等の制作物を作成する利用に限られ、本データ自体を
 *     ソフトウェア製品に同梱して配布する利用は含みません」
 *   - 拡張: 「ゲーム・アプリケーション等のソフトウェア製品に組み込み…
 *     には拡張ライセンスが必要です」
 *   - 再配布・転売・貸与、AI学習利用は「一律禁止」ではなく「事前の個別
 *     合意（要相談）」で可能にする方針（2026-07-23改定）。案件により条件が
 *     大きく変わるため、標準/拡張/エディトリアルの全ティアで "ask" とし、
 *     購入前にお問い合わせいただく導線にする。当社としてはAI学習用途にも
 *     前向きで、将来的にはAI学習データのプラットフォーム化も視野に入れている
 *     （方針が「禁止」に見えると機会損失になるため、可否表の見え方を修正）。
 */
export type LicenseAllowance = "yes" | "no" | "ask";

export const DATA_LICENSE_MATRIX: {
  key: string;
  labelJa: string;
  labelEn: string;
  by: Record<DataLicense, LicenseAllowance>;
}[] = [
  {
    key: "production",
    labelJa: "映像・画像などの制作物に使う（商用可）",
    labelEn: "Use in film / image productions (commercial OK)",
    by: { standard: "yes", extended: "yes", custom: "ask", editorial: "no" },
  },
  {
    key: "embedding",
    labelJa: "ゲーム・アプリ等への組込／テンプレートへの同梱・改変配布",
    labelEn: "Embedding in games & apps / bundling into templates",
    by: { standard: "no", extended: "yes", custom: "ask", editorial: "no" },
  },
  {
    // 規約 第4条:「本データの第三者への再配布・転売・貸与」＝原則禁止だが、
    // 事前の書面許諾があれば可能（一律禁止ではなく要相談）。
    key: "resale",
    labelJa: "データ自体の再配布・転売・貸与",
    labelEn: "Redistributing, reselling or lending the data itself",
    by: { standard: "ask", extended: "ask", custom: "ask", editorial: "ask" },
  },
  {
    // 規約 第4条:「機械学習・生成AIモデルの学習データとして利用する行為
    // （本サービスの事前の書面による許諾がある場合を除く）」＝原則禁止だが、
    // 事前の書面許諾があれば可能（一律禁止ではなく要相談）。
    key: "aiTraining",
    labelJa: "機械学習・生成AIの学習データとして使う",
    labelEn: "Using as training data for machine learning / generative AI",
    by: { standard: "ask", extended: "ask", custom: "ask", editorial: "ask" },
  },
];

/** 可否表の下に出す補足。ライセンスを問わず効く条件を明示する。 */
export const DATA_LICENSE_MATRIX_NOTE_JA =
  "再配布・転売・貸与、AI学習利用は、いずれのライセンスも事前のご相談・個別合意が必要です。ご希望の場合はお気軽にお問い合わせください。本データには撮影対象の空間に写り込んだ第三者の看板・広告・ロゴ・美術品等が含まれる場合があります。制作物として公開・納品・配布する際は、ライセンス区分によらず、それらを削除・加工したうえでご利用ください（詳細はデータ購入規約第3条）。";
export const DATA_LICENSE_MATRIX_NOTE_EN =
  "Redistribution/resale and AI-training use require prior consultation and a separate agreement, regardless of license. Please contact us if you're interested. The data may include third-party signage, advertisements, logos, or artwork captured within the scanned space. Before publishing, delivering, or distributing any work you create, please remove or edit out such material — this applies to every license tier (see Article 3 of the data purchase terms for details).";

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
  /** EN版の代替テキスト（空なら alt をそのまま使う）。自動翻訳で埋まる。 */
  altEn: z.string().max(400).default(""),
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
  /** 公開URL(=id)を確認・変更した日時(ISO)。空なら未確認。
      renamePropertyAction（変更）と confirmPropertySlugAction（このURLでよい）
      の両方でセットされる。公開申請の必須項目（publishablePropertySchema）。 */
  urlConfirmedAt: z.string().default(""),
  status: z.enum(PROPERTY_STATUSES).default("draft"),
  visibility: z.enum(PROPERTY_VISIBILITIES).default("public"),

  // 1. Basic (draft-permissive — strictness applied in publishablePropertySchema)
  title: z.string().max(120).default(""),
  /** EN版の表示名（空なら title をそのまま使う）。summary/description も同様。 */
  titleEn: z.string().max(160).default(""),
  category: z.enum(PROPERTY_CATEGORIES),
  area: z.string().max(40).default(""),
  prefecture: z.string().max(20).default(""),
  city: z.string().max(40).default(""),
  /** EN版の市区町村表記（例: "Tsurumi, Yokohama"。空なら日本語のまま）。 */
  cityEn: z.string().max(80).default(""),
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
  /**
   * 料金の性質。道路使用許可が必要な屋外スポット等（permitRequired）向け:
   *   hourly = 通常の時間単価（既定値。hourlyPrice を ¥X/HR として表示）
   *   flat   = 時間に関わらず定額（hourlyPrice の値を「撮影許可」費用として表示）
   *   free   = 使用料無料（金額を表示せず「無料」と表示）
   */
  priceType: z.enum(["hourly", "flat", "free"]).default("hourly"),
  /**
   * 許可の種類（例: 道路使用許可 / 公園使用許可 / 施設利用許可）。
   * permitRequired な物件の表示文言に使う。空なら汎用の「撮影許可」。
   */
  permitType: z.string().max(40).default(""),
  /** EN版の許可種類表記（空なら日本語のまま）。自動翻訳で埋まる。 */
  permitTypeEn: z.string().max(80).default(""),
  summary: z.string().max(200, "200 文字以内で入力してください").default(""),
  summaryEn: z.string().max(400).default(""),

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
  /** 駐車可能台数（0 = 未設定 / 台数不明）。 */
  parkingCapacity: z.number().int().min(0).max(9999).default(0),
  loadingDock: z.boolean().default(false),
  /** 防音設備の有無。 */
  soundproofing: z.boolean().default(false),
  /** インターネット回線の有無。 */
  hasInternet: z.boolean().default(false),
  /** 住所（都道府県・市区町村より詳細な番地まで）。 */
  address: z.string().max(120).default(""),
  /** EN版の住所表記（空なら日本語のまま）。自動翻訳で埋まる。 */
  addressEn: z.string().max(240).default(""),
  /** 最寄り駅（路線・駅名・徒歩分など自由記述）。 */
  nearestStation: z.string().max(80).default(""),
  /** EN版の最寄り駅表記（空なら日本語のまま）。自動翻訳で埋まる。 */
  nearestStationEn: z.string().max(160).default(""),

  // ── 利用条件・アクセス ──
  /** 利用可能時間（例: 24時間可（要相談））。自由記述の補足情報。 */
  availableHours: z.string().max(120).default(""),
  /** EN版の利用可能時間（空なら日本語のまま）。自動翻訳で埋まる。 */
  availableHoursEn: z.string().max(240).default(""),
  /** 利用可能な時間帯（開始〜終了）。"HH:mm" 24時間表記、どちらか片方でも空なら未設定扱い。 */
  customHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .or(z.literal(""))
    .default(""),
  customHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .or(z.literal(""))
    .default(""),
  /** 撮影可能日（例: 平日／土日祝（要相談））。 */
  availableDays: z.string().max(120).default(""),
  /** 申込期限・リードタイム（例: 1週間前）。 */
  bookingDeadline: z.string().max(80).default(""),

  // ── 撮影条件（設備の有無） ──
  fireAllowed: z.boolean().default(false),
  greenRoom: z.boolean().default(false),
  restroom: z.boolean().default(false),
  airConditioning: z.boolean().default(false),
  smokingArea: z.boolean().default(false),

  // ── 料金の内訳 ──
  /** 最低利用時間（h）。0 = 設定なし。 */
  minUsageHours: z.number().int().min(0).max(999).default(0),
  /** 表示金額が税込なら true（false = 税別）。 */
  taxIncluded: z.boolean().default(false),
  /** ロケハン費（例: 1.5hまで無料）。 */
  scoutingFee: z.string().max(120).default(""),
  /** 追加費用（照明・音響・機材など。複数行可）。 */
  extraFees: z.string().max(500).default(""),

  // ── ルール・規程 ──
  /** 禁止事項（複数行可）。 */
  prohibitedItems: z.string().max(1000).default(""),
  /** キャンセルポリシー（複数行可）。 */
  cancellationPolicy: z.string().max(1000).default(""),
  /** 保険加入の要否。 */
  insuranceRequired: z.boolean().default(false),
  /** 立ち会いの要否。 */
  attendanceRequired: z.boolean().default(false),

  // ── 実績・特徴 ──
  /** 撮影実績（例: MV／映画／ドラマ／CM）。 */
  shootingHistory: z.string().max(300).default(""),
  /** 撮影できるシーン・空間（例: 教室、屋上、図書館、ホール。複数行可）。 */
  availableScenes: z.string().max(500).default(""),
  /** 内装・床/壁の素材・色。 */
  interiorNotes: z.string().max(300).default(""),
  /** 自然光の方角・入り方（例: 南向き大窓、午前順光）。 */
  lightDirection: z.string().max(80).default(""),
  /** 周辺環境（例: 静かな住宅街／湾岸の再開発エリア）。 */
  surroundings: z.string().max(300).default(""),

  // ⚠ 上限は検索キーワードとして使い切れる余地を残すため 60 に設定
  //   （旧20は AIタグ自動生成が1回で12個返すだけで手入力の余地がほぼ無かった）。
  tags: z.array(z.string().min(1).max(20)).max(60).default([]),

  // 2.5 Contact — property-level contact info (overrides account-level)
  contactWebsite: z.string().max(300).default(""),
  contactPhone: z.string().max(40).default(""),
  contactEmail: z.string().max(120).default(""),

  // 2.55 Permit-required public spot (例: スクランブル交差点など、施設所有者への
  // 通常の問い合わせ先が存在せず、撮影に道路使用許可等の別手続きが必要な場所)
  permitRequired: z.boolean().default(false),
  permitNotes: z.string().max(1000).default(""),
  /** EN版の許可・注意事項（空なら日本語のまま）。自動翻訳で埋まる。警察署名・
   *  電話番号等の実務情報は原文のまま保持される想定。 */
  permitNotesEn: z.string().max(2000).default(""),

  // 2.6 Blueprints / floor plans
  blueprints: z.array(z.object({
    label: z.string().max(60).default(""),
    url: urlOrPath(),
  })).max(10).default([]),

  // 3. Description
  description: z.string().max(4000).default(""),
  descriptionEn: z.string().max(8000).default(""),

  // 4. Photos
  cover: propertyImageSchema,
  gallery: z.array(propertyImageSchema).max(40).default([]),

  // 5. 3DGS
  splatUrl: urlOrPath(),
  zipUrl: urlOrPath(),
  zipSizeMb: z.number().min(0).max(99999).default(0),
  splatSizeMb: z.number().min(0).max(99999).default(0),
  splatItems: z.array(z.object({
    // シーンの永続識別子。配列内の位置(index)は並び替え/削除で動くため、
    // トークン解除(view-unlocks)の紐付けキーには index ではなくこの id を使う。
    // 空文字なら store.ts の読み込み時に一度だけ自動採番して書き戻す。
    id: z.string().default(""),
    label: z.string().max(60).default(""),
    /** EN版のシーン名（空なら label をそのまま使う）。自動翻訳で埋まる。 */
    labelEn: z.string().max(120).default(""),
    splatUrl: urlOrPath(),
    previewVideoUrl: urlOrPath(),
    sizeMb: z.number().min(0).max(99999).default(0),
    notes: z.string().max(500).default(""),
    forSale: z.boolean().default(false),
    salePrice: z.number().int().min(0).max(99999999).default(0),
    /**
     * このデータ単体の限定無料期間（¥0で購入可能にする）。旧実装は
     * 全物件共通のサイト設定(dataSaleFreePeriod)だったが、同じ物件内でも
     * データごとにキャンペーン時期が異なるケースに対応するためアイテム
     * 単位に変更（2026-07-23）。判定ロジックは settings-schema.ts の
     * dataSalePeriodStatus/isDataSaleFree/isDataSaleDisabled をそのまま再利用。
     */
    freePeriod: dataSaleFreePeriodSchema.default({
      enabled: false,
      startAt: null,
      endAt: null,
      note: "",
      afterEnd: "revert_to_price",
    }),
    saleDescription: z.string().max(1000).default(""),
    /** EN版の販売説明文（空なら日本語のまま）。 */
    saleDescriptionEn: z.string().max(2000).default(""),
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
    // 商品スペック（TurboSquid風）。データ容量(sizeMb)は既存フィールドを使い回す
    // （旧 pointCount＝点群数は「あっても参考にならない」との判断で撤去済み）。
    captureDevice: z.string().max(80).default(""),
    // 販売ライセンス区分（レガシー単一ティア）。licenseOptions が空の場合の
    // フォールバックとして残す（既存データとの後方互換）。
    license: z.enum(DATA_LICENSES).default("standard"),
    // 複数ライセンス区分をそれぞれ価格を付けて販売できるようにする
    // (downloadFiles と同じ「マルチ + レガシー単一フォールバック」パターン)。
    // 空なら上の license/salePrice を単一ティアとしてフォールバック扱い
    // (resolveLicenseOptions() を参照)。買い手は購入時にこの中から1つ選ぶ。
    licenseOptions: z.array(z.object({
      license: z.enum(DATA_LICENSES),
      price: z.number().int().min(0).max(99999999),
    })).max(4).default([]),
    // エディトリアル(報道・教育限定)ライセンスで販売する場合に必須の権利者
    // クレジット表記。公開ページ・購入時のライセンステキストに表示する。
    editorialRightsCredit: z.string().max(300).default(""),
    // 日付別バージョン管理: 再スキャン等で更新された一括ダウンロードZIPを
    // 日付ごとに保持する(downloadFiles と同じ「マルチ + 単一フォールバック」
    // パターン)。空なら上の downloadFileUrl/scannedAt を単一バージョン扱い
    // (resolveDownloadVersions() を参照)。価格差は無いため購入時の選択は
    // 不要 — 購入後、購入履歴ページでいつでもどの日付でもダウンロード可能。
    downloadVersions: z.array(z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD で入力してください")
        .or(z.literal("")),
      url: urlOrPath(),
      sizeMb: z.number().min(0).max(99999).default(0),
    })).max(20).default([]),
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
   *   5 = 大型ドーム・複合施設 (複数区画/複数シーン規模)
   * Subscription plans grant a monthly token budget; Free gives 1 walk-through
   * irrespective of cost.
   */
  tokenCost: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)]).default(1),
  /**
   * 空間の複雑さ（DECISION_LOG D-008 の検証用・非公開の分析タグ）。
   *
   * 判定軸は「**3Dが、その物件が既に持っている写真＋図面に勝つか**」。
   * サイズ基準の tokenCost とは独立した軸である点に注意:
   *   complex … 多部屋ハウススタジオ・特殊内装・複雑構造（小さくても complex）
   *   simple  … 白ホリ等の単室（広くても simple。写真1枚と平面図でほぼ伝わる）
   *
   * どの空間タイプが実際に閲覧・成約されたかを後から集計し、「スキャンすべき
   * 対象」を実測で決めるために記録する。今この欄を持たせておかないと、
   * 後から遡って分類できない（＝判断が永久に推測のままになる）。
   * unset = 未分類（既存データの初期値。明示的な simple とは区別する）
   */
  spatialComplexity: z.enum(["unset", "simple", "complex"]).default("unset"),
  /**
   * スタジオが公開申請した日時 (ISO)。null = 未申請。
   * 公開時・却下時にクリアする。運営一覧の「申請中」バッジの根拠。
   *
   * 新しい status は増やさない: status は draft のまま、この欄の有無だけで
   * 「申請中」を表現する（既存の status 遷移・一括操作・フィルタを壊さないため）。
   */
  publishRequestedAt: z.string().nullable().default(null),
  annotations: z.array(annotationSchema).max(200).default([]),

  // Data sale fields moved to splatItems[].forSale/salePrice/saleDescription

  // 6. Studio page builder — ordered content blocks for the public page.
  //    Empty = render the default detail layout (no regression).
  pageBlocks: z.array(pageBlockSchema).max(60).default([]),

  // Meta
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  /**
   * 初回公開時刻 (ISO)。publish 系アクションが「未設定のときだけ」刻む
   * サーバ管理フィールド（下書き⇄公開を往復しても最初の公開日を保持）。
   * カタログの "New" バッジ（公開から2ヶ月間）の基準。旧データは未設定
   * のため、判定側は createdAt にフォールバックする。
   */
  publishedAt: z.string().datetime().optional(),
});

/** 公開(初回)から2ヶ月以内なら true — カタログの "New" バッジ判定。 */
export function isNewProperty(
  p: { publishedAt?: string; createdAt?: string },
  now: Date = new Date(),
): boolean {
  const base = p.publishedAt || p.createdAt;
  if (!base) return false;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date(d);
  cutoff.setMonth(cutoff.getMonth() + 2);
  return now < cutoff;
}

/**
 * Schema used when publishing — re-validates with stricter rules.
 * All "required for publish" fields are enforced here, not in the draft schema.
 */
export const publishablePropertySchema = propertySchema.extend({
  urlConfirmedAt: z.string().min(1, "公開URLを確認してください"),
  title: z
    .string()
    .min(2, "タイトルは 2 文字以上で入力してください")
    .max(120),
  area: z.string().min(1, "エリアを入力してください").max(40),
  prefecture: z.string().min(1, "都道府県を入力してください").max(20),
  city: z.string().min(1, "市区町村を入力してください").max(40),
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
  // 3DGS データは公開の必須条件ではない（都のロケーションボックス等の写真のみ
  // カタログと同様、スキャン前でも掲載できるようにする）。3DGS が無い物件は
  // 詳細ページ側で「3DGSデータは準備中です」の空表示にフォールバックする
  // （property-detail-view.tsx）。

  // スクランブル交差点など「施設所有者への通常の問い合わせ先が存在せず、撮影に
  // 道路使用許可等の別手続きが必要な場所」(permitRequired) はレンタル料金という
  // 概念自体がないため、料金入力を必須にしない。それ以外は従来通り必須。
  if (!data.permitRequired && data.hourlyPrice < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hourlyPrice"],
      message: "料金を入力してください",
    });
  }

  // forSale=true（3Dデータ販売中）なのにダウンロードファイルが1つも無い項目は
  // 公開させない。以前は管理画面の一覧で「⚠DLファイル未設定」を警告表示する
  // だけで公開自体は止めておらず、購入APIが購入自体を409で弾くことで実害を
  // 防いでいたが、管理者が矛盾した状態のまま公開できてしまっていた。
  data.splatItems.forEach((item, i) => {
    if (!item.forSale) return;
    const hasFile =
      item.downloadFiles.some((f) => f.url && f.format) || !!item.downloadFileUrl;
    if (!hasFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["splatItems", i, "downloadFileUrl"],
        message: `「${item.label || `シーン#${i + 1}`}」は販売中に設定されていますが、ダウンロードファイルが未設定です`,
      });
    }

    // エディトリアル(報道・教育限定)ライセンスで売る項目は、公開時に権利者
    // クレジット表記が必須（ニュース・報道等での利用時に表示義務があるため）。
    const usesEditorial =
      item.licenseOptions.length > 0
        ? item.licenseOptions.some((o) => o.license === "editorial")
        : item.license === "editorial";
    if (usesEditorial && !item.editorialRightsCredit.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["splatItems", i, "editorialRightsCredit"],
        message: `「${item.label || `シーン#${i + 1}`}」はエディトリアルライセンスで販売されていますが、権利表記が未入力です`,
      });
    }
  });
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

/** 47都道府県のローマ字表記（EN版の所在地表示用）。 */
export const PREFECTURE_EN: Record<string, string> = {
  北海道: "Hokkaido", 青森県: "Aomori", 岩手県: "Iwate", 宮城県: "Miyagi",
  秋田県: "Akita", 山形県: "Yamagata", 福島県: "Fukushima", 茨城県: "Ibaraki",
  栃木県: "Tochigi", 群馬県: "Gunma", 埼玉県: "Saitama", 千葉県: "Chiba",
  東京都: "Tokyo", 神奈川県: "Kanagawa", 新潟県: "Niigata", 富山県: "Toyama",
  石川県: "Ishikawa", 福井県: "Fukui", 山梨県: "Yamanashi", 長野県: "Nagano",
  岐阜県: "Gifu", 静岡県: "Shizuoka", 愛知県: "Aichi", 三重県: "Mie",
  滋賀県: "Shiga", 京都府: "Kyoto", 大阪府: "Osaka", 兵庫県: "Hyogo",
  奈良県: "Nara", 和歌山県: "Wakayama", 鳥取県: "Tottori", 島根県: "Shimane",
  岡山県: "Okayama", 広島県: "Hiroshima", 山口県: "Yamaguchi", 徳島県: "Tokushima",
  香川県: "Kagawa", 愛媛県: "Ehime", 高知県: "Kochi", 福岡県: "Fukuoka",
  佐賀県: "Saga", 長崎県: "Nagasaki", 熊本県: "Kumamoto", 大分県: "Oita",
  宮崎県: "Miyazaki", 鹿児島県: "Kagoshima", 沖縄県: "Okinawa",
};

// 「神奈川エリア」のように suffix 抜きで書かれるエリア名 → romaji の逆引き。
const PREFECTURE_EN_BY_BASE: Record<string, string> = Object.fromEntries(
  Object.entries(PREFECTURE_EN).map(([jp, enName]) => [jp.replace(/[都道府県]$/, ""), enName]),
);

/** "神奈川エリア" → "Kanagawa Area"。未知のエリア名はそのまま返す。 */
export function areaLabelEn(area: string): string {
  const m = area.match(/^(.+?)エリア$/);
  if (m && PREFECTURE_EN_BY_BASE[m[1]]) return `${PREFECTURE_EN_BY_BASE[m[1]]} Area`;
  return area;
}

/** よく使うスタジオ種類の英訳（ベストエフォート。未知はそのまま表示）。 */
export const STUDIO_TYPE_EN: Record<string, string> = {
  倉庫: "Warehouse", 白ホリスタジオ: "Cyclorama studio", ハウススタジオ: "House studio",
  スタジオ: "Studio", 古民家: "Traditional house", 廃墟: "Ruins", 工場: "Factory",
  学校: "School", 店舗: "Shop", 屋外: "Outdoor", 会場: "Venue", ドーム: "Dome",
  体育館: "Gymnasium", オフィス: "Office", 教会: "Church", 住宅: "House",
  交差点: "Intersection", 路地: "Alley", 商店街: "Shopping street", 駅: "Station",
  橋: "Bridge", 神社: "Shrine", 寺: "Temple", 公園: "Park", 海岸: "Coast",
};

/** よく使うタグの英訳（ベストエフォート。未知タグはそのまま表示）。 */
export const TAG_EN: Record<string, string> = {
  倉庫: "Warehouse", コンクリート: "Concrete", 鉄骨: "Steel frame", 天井高: "High ceiling",
  白ホリ: "Cyclorama", スタジオ: "Studio", 屋外: "Outdoor", 住宅: "House",
  古民家: "Traditional house", 廃墟: "Ruins", 工場: "Factory", 学校: "School",
  店舗: "Shop", 自然光: "Natural light", 駐車場: "Parking", 搬入口: "Loading dock",
  防音: "Soundproof", 屋上: "Rooftop", 和室: "Japanese room", 洋室: "Western room",
  会場: "Venue", ドーム: "Dome", 体育館: "Gymnasium", オフィス: "Office",
  キッチン: "Kitchen", プール: "Pool", 教会: "Church", 森: "Forest", 海: "Sea",
  川: "River", 公園: "Park", 夜景: "Night view",
  ロケーション: "Location", 交差点: "Intersection", 東京都: "Tokyo",
};

/**
 * EN版表示用に title/summary/description（英語フィールドで差し替え）と
 * 所在地・エリア・タグ（辞書ベースの機械変換）を英語化したシャローコピーを返す。
 * 英語フィールドが空の物件は日本語のまま = 段階的移行可。サーバーページの
 * データ取得直後に通せば、下流の PropertyCard 等は無改修で済む。
 * 注意: 関連物件スコアリング等のロジックには原文(raw)の方を渡すこと。
 */
export function localizeProperty<
  T extends Pick<
    Property,
    | "title"
    | "titleEn"
    | "summary"
    | "summaryEn"
    | "description"
    | "descriptionEn"
    | "prefecture"
    | "city"
    | "cityEn"
    | "area"
    | "tags"
    | "studioType"
    | "splatItems"
    | "address"
    | "addressEn"
    | "nearestStation"
    | "nearestStationEn"
    | "availableHours"
    | "availableHoursEn"
    | "permitType"
    | "permitTypeEn"
    | "permitNotes"
    | "permitNotesEn"
    | "cover"
    | "gallery"
  >,
>(p: T, locale?: string): T {
  if (locale !== "en") return p;
  return {
    ...p,
    title: p.titleEn || p.title,
    summary: p.summaryEn || p.summary,
    description: p.descriptionEn || p.description,
    prefecture: PREFECTURE_EN[p.prefecture] || p.prefecture,
    city: p.cityEn || p.city,
    area: areaLabelEn(p.area),
    studioType: STUDIO_TYPE_EN[p.studioType] || p.studioType,
    tags: p.tags.map((t) => TAG_EN[t] || t),
    address: p.addressEn || p.address,
    nearestStation: p.nearestStationEn || p.nearestStation,
    availableHours: p.availableHoursEn || p.availableHours,
    permitType: p.permitTypeEn || p.permitType,
    permitNotes: p.permitNotesEn || p.permitNotes,
    cover: { ...p.cover, alt: p.cover.altEn || p.cover.alt },
    gallery: p.gallery.map((g) => ({ ...g, alt: g.altEn || g.alt })),
    splatItems: p.splatItems.map((it) => ({
      ...it,
      label: it.labelEn || it.label,
      saleDescription: it.saleDescriptionEn || it.saleDescription,
    })),
  };
}

export type PriceType = "hourly" | "flat" | "free";

export const PRICE_TYPE_LABEL: Record<PriceType, string> = {
  hourly: "時間単価（¥/HR）",
  flat: "撮影許可（時間に関わらず一定）",
  free: "無料（使用料なし）",
};

export const PRICE_TYPE_LABEL_EN: Record<PriceType, string> = {
  hourly: "Hourly rate (¥/HR)",
  flat: "Permit fee (regardless of duration)",
  free: "Free (no usage fee)",
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
export const TOKEN_COST_LABEL: Record<1 | 2 | 3 | 5, string> = {
  1: "ハウス / 小規模",
  2: "中規模スタジオ",
  3: "ドーム / 大規模",
  5: "大型ドーム / 複合施設",
};

export const TOKEN_COST_LABEL_EN: Record<1 | 2 | 3 | 5, string> = {
  1: "House / small",
  2: "Mid-size studio",
  3: "Dome / large",
  5: "Large dome / multi-venue complex",
};

export function tokenCostLabel(t: 1 | 2 | 3 | 5, locale?: string): string {
  return locale === "en" ? TOKEN_COST_LABEL_EN[t] : TOKEN_COST_LABEL[t];
}

/**
 * Monthly recurring token budget per plan.
 *
 * 単価は上位プランほど安くなること（逓減）を必ず維持する。以前は
 * individual ¥325 / studio ¥408 / team ¥497 と逆転しており、上位プランほど
 * トークンが割高＝アップグレードするほど損という設計になっていた。加えて
 * studio(10端末)で24トークンは1人あたり月2.4件しか閲覧できず、チーム商品
 * として実用に耐えなかった。端末数に見合う配分へ引き上げてある。
 *
 * 現行単価: individual ¥325 / studio ¥306 / team ¥248（月額 ÷ 本数）
 */
export const PLAN_TOKEN_BUDGET = {
  free: 0,       // free has no monthly budget — only the signup bonus below
  individual: 16,
  studio: 32,
  team: 120,
} as const;

/**
 * 従量課金（トークンパック）。サブスクに満たない利用者と、カタログが薄い
 * 現段階での支払い意思を測るための単発購入。
 *
 * 単価はサブスクより高く設定する（¥600/本 > individual の ¥325/本）。
 * これを下回るとサブスクへ移行する動機が消えるため、値下げする場合も
 * PLAN_LIST_PRICE_JPY.individual / PLAN_TOKEN_BUDGET.individual を上回る
 * 単価を維持すること。
 */
export const TOKEN_PACK = {
  tokens: 5,
  priceYen: 3000,
  /** 購入トークンの有効期間（月）。サブスク付与分と同じ1年運用。 */
  expiryMonths: 12,
} as const;

/**
 * List price (JPY, tax included, monthly billing) per paid plan. Kept in sync
 * with plan-cards.tsx and stripe-setup-prices/route.ts by convention — used
 * for the admin subscription-revenue estimate (actual billed amount may
 * differ for annual subscribers, who get the -20% discount).
 */
export const PLAN_LIST_PRICE_JPY = {
  free: 0,
  individual: 5200,
  studio: 9800,
  team: 29800,
} as const;

/** One-time bonus tokens granted at account creation. Currently only used by Free. */
export const SIGNUP_BONUS_TOKENS = 6;

/** 3DGS data resale price by size class (per scan; "ドーム" is per zone/区画). */
export const DATA_SALE_PRICE: Record<1 | 2 | 3 | 5, number> = {
  1: 100_000,
  2: 250_000,
  3: 300_000, // per 区画
  5: 500_000,
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
