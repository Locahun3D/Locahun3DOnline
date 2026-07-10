/**
 * Account / user schema — PURE (no server-only, no node imports).
 * Identity (login, password, Google OAuth, 2FA) is owned by Clerk.
 * This record holds the APP-level data Clerk doesn't: role, approval status,
 * NDA, tokens, bookmarks — keyed by the Clerk userId (`id`).
 *
 * Five account types:
 *   individual  個人        — instant active, sees public listings
 *   studio      撮影スタジオ  — lists/rents own studios, instant active, edits linked properties
 *   production  制作会社      — pro; NDA + approval → can see confidential listings
 *   guest       ゲスト        — invite-only 貢献特別枠; granted 100 non-expiring tokens
 *   admin       管理者        — site operator, full /admin access
 */
import { z } from "zod";

export const ACCOUNT_ROLES = [
  "individual",
  "studio",
  "production",
  "guest",
  "admin",
] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** Non-expiring tokens granted once to a guest (貢献特別枠) at creation. */
export const GUEST_BONUS_TOKENS = 100;

export const ACCOUNT_STATUSES = ["active", "pending", "suspended"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_PLANS = ["free", "individual", "studio", "team"] as const;
export type AccountPlan = (typeof ACCOUNT_PLANS)[number];

/** Roles a visitor can pick during onboarding (admin is assigned, not chosen). */
export const SELF_SIGNUP_ROLES = ["individual", "studio", "production"] as const;

export const ROLE_LABEL: Record<AccountRole, string> = {
  individual: "個人",
  studio: "撮影スタジオ",
  production: "制作会社",
  guest: "ゲスト",
  admin: "管理者",
};

export const ROLE_DESCRIPTION: Record<AccountRole, string> = {
  individual: "撮影前ロケハンに 3D を使う個人・フリーランス。すぐ利用可。",
  studio: "自社スタジオを掲載・貸し出す事業者。登録後すぐ利用可。",
  production: "NDA 締結のうえ、倉庫裏など機密ロケ地まで閲覧できるプロアカウント。",
  guest: `招待制の貢献特別枠。作成時に失効しないトークンを ${GUEST_BONUS_TOKENS} 付与。`,
  admin: "サイト運営者。",
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "有効",
  pending: "承認待ち",
  suspended: "停止中",
};

export const ROLE_LABEL_EN: Record<AccountRole, string> = {
  individual: "Individual",
  studio: "Studio",
  production: "Production",
  guest: "Guest",
  admin: "Admin",
};

export const ACCOUNT_STATUS_LABEL_EN: Record<AccountStatus, string> = {
  active: "Active",
  pending: "Pending approval",
  suspended: "Suspended",
};

export const ROLE_DESCRIPTION_EN: Record<AccountRole, string> = {
  individual: "Individuals and freelancers using 3D for pre-shoot scouting. Available immediately.",
  studio: "Operators who list and rent out their own studio. Available right after signup.",
  production: "Pro accounts that, after signing an NDA, can view confidential locations such as backyards.",
  guest: `Invite-only contributor tier. Granted ${GUEST_BONUS_TOKENS} non-expiring tokens at creation.`,
  admin: "Site operator.",
};

export function roleLabel(role: AccountRole, locale?: string): string {
  return locale === "en" ? ROLE_LABEL_EN[role] : ROLE_LABEL[role];
}
export function roleDescription(role: AccountRole, locale?: string): string {
  return locale === "en" ? ROLE_DESCRIPTION_EN[role] : ROLE_DESCRIPTION[role];
}
export function accountStatusLabel(status: AccountStatus, locale?: string): string {
  return locale === "en" ? ACCOUNT_STATUS_LABEL_EN[status] : ACCOUNT_STATUS_LABEL[status];
}

/**
 * 承認が必要なのは制作会社 (production = チーム/法人枠) のみ。
 * 個人・撮影スタジオは登録後すぐに有効。
 */
export function requiresApproval(role: AccountRole): boolean {
  return role === "production";
}

/** production must accept an NDA before viewing confidential listings. */
export function requiresNda(role: AccountRole): boolean {
  return role === "production";
}

export const userSchema = z.object({
  /** Clerk userId (e.g. "user_2ab..."). */
  id: z.string().min(1),
  email: z.email(),
  name: z.string().min(1).max(80),
  /**
   * 掲示板等に表示する公開表示名（ユーザーが任意設定）。空文字 = 未設定で、
   * その場合は従来どおり name（Clerk 由来の氏名）を表示に使う。
   * 過去の投稿は投稿時スナップショット（comments.userName）のままで変わらない。
   */
  displayName: z.string().max(30).default(""),
  role: z.enum(ACCOUNT_ROLES).default("individual"),
  status: z.enum(ACCOUNT_STATUSES).default("active"),
  /** Has the user completed the role/NDA onboarding step? */
  onboarded: z.boolean().default(false),
  company: z.string().max(120).default(""),
  phone: z.string().max(40).default(""),
  plan: z.enum(ACCOUNT_PLANS).default("free"),
  /** Monthly/plan tokens — subject to the 1-year expiry policy. */
  tokenBalance: z.number().int().min(0).default(0),
  /** Contribution (貢献特別枠) tokens — never expire. Granted to guests. */
  bonusTokens: z.number().int().min(0).default(0),
  /** 月次/付与トークン(tokenBalance)の失効予定日 (ISO)。null = 失効予定なし。 */
  tokenExpiresAt: z.string().nullable().default(null),
  /**
   * 次回の月次トークン補充予定日 (ISO)。有料プランのみ設定。null = 補充対象外
   * (freeプラン/未契約)。Stripe の請求サイクル(年払いなら年1回)とは独立して、
   * ユーザーの読み込み時に毎月自動で満タン補充するための内部クロック。
   */
  tokenRefillAt: z.string().nullable().default(null),
  /** Stripe Customer ID (cus_…)。サブスク契約後に紐付け。null = 未連携。 */
  stripeCustomerId: z.string().nullable().default(null),
  /** ISO timestamp when the NDA was accepted; null = not accepted. */
  ndaAcceptedAt: z.string().nullable().default(null),
  /** Property IDs this studio owner is authorized to manage. Set by admin. */
  linkedPropertyIds: z.array(z.string()).max(100).default([]),
  bookmarks: z.array(z.string()).max(500).default([]),
  /** ユーザー定義のブックマーク・フォルダ一覧（v1: フラット、ネスト無し）。 */
  bookmarkFolders: z
    .array(z.object({ id: z.string(), name: z.string().max(60) }))
    .max(50)
    .default([]),
  /** propertyId -> folderId。エントリが無い bookmark 済み物件は「未整理」。 */
  bookmarkFolderAssignments: z.record(z.string(), z.string()).default({}),
  /**
   * propertyId -> タグ配列。フォルダ（排他的な1箱）とは別に、案件をまたいで
   * 複数付けられる横断ラベル（例: 1物件に「CM案件A」「屋外候補」の両方）。
   * タグ自体のマスタ一覧は持たず、使用中のタグは表示時に一覧から動的に集計する。
   */
  bookmarkTags: z.record(z.string(), z.array(z.string().max(30)).max(10)).default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type User = z.infer<typeof userSchema>;

/** No secrets live in this record anymore (Clerk owns identity), so the */
/** public-facing shape equals the stored shape. Helpers kept for call sites. */
export type PublicUser = User;
export function toPublicUser(u: User): PublicUser {
  return u;
}

/** Spendable token total = monthly balance + non-expiring contribution tokens. */
export function totalTokens(u: Pick<User, "tokenBalance" | "bonusTokens">): number {
  return u.tokenBalance + (u.bonusTokens ?? 0);
}

/** 画面表示・新規投稿の投稿者名に使う公開表示名。displayName 優先、未設定は氏名。 */
export function publicDisplayName(u: Pick<User, "name" | "displayName">): string {
  return (u.displayName ?? "").trim() || u.name;
}

/** 付与トークンの標準失効期間 = 付与から1年。 */
export function oneYearFrom(nowIso: string): string {
  const d = new Date(nowIso);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

/** 月次トークン補充の次回予定日 = 今から1ヶ月後。 */
export function oneMonthFrom(nowIso: string): string {
  const d = new Date(nowIso);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/** Whether this user may view confidential listings right now. */
export function canViewConfidential(u: PublicUser | null): boolean {
  if (!u || u.status !== "active") return false;
  if (u.role === "admin") return true;
  return u.role === "production" && !!u.ndaAcceptedAt;
}

/**
 * Whether this user can view restricted 3DGS files (バックヤード/搬入口/バックステージ等).
 * Requires: production account + active status + Team plan.
 */
export function canViewBackyard(u: PublicUser | null): boolean {
  if (!u || u.status !== "active") return false;
  if (u.role === "admin") return true;
  return u.role === "production" && u.plan === "team";
}

/**
 * Whether this user can view NDA-only 3DGS files
 * (ドーム詳細構造・天井リギング・ライブ会場機密エリア等).
 * Requires: production account + Team plan + NDA accepted.
 */
export function canViewNdaOnly(u: PublicUser | null): boolean {
  if (!u || u.status !== "active") return false;
  if (u.role === "admin") return true;
  return u.role === "production" && u.plan === "team" && !!u.ndaAcceptedAt;
}

/** Captured on the /onboarding step after Clerk sign-up. */
export const onboardingSchema = z.object({
  role: z.enum(SELF_SIGNUP_ROLES),
  company: z.string().max(120).optional().default(""),
  phone: z.string().max(40).optional().default(""),
  nda: z.boolean().optional().default(false),
});

/** Shared return type for form Server Actions. */
export type ActionState =
  | { errors?: Record<string, string[] | undefined>; message?: string }
  | undefined;
