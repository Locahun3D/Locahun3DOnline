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

/**
 * 撮影スタジオ(studio)は「自分の物件を管理する」専用アカウント。
 * サブスク契約・トークン購入・他物件の3Dデータ購入・トークン消費視聴は
 * 対象外（2026-08-01 の方針）。掲載者としての機能（掲載ページ作成・
 * admin側プレビューでの自分の物件の確認）は引き続き使える。
 */
export function isStudioPurchaseRestricted(role: AccountRole | string | undefined | null): boolean {
  return role === "studio";
}

export const userSchema = z.object({
  /** Clerk userId (e.g. "user_2ab..."). */
  id: z.string().min(1),
  email: z.email(),
  name: z.string().min(1).max(80),
  /**
   * 掲示板等に表示する公開表示名（ユーザーが任意設定）。空文字 = 未設定で、
   * その場合は従来どおり name（Clerk 由来の氏名）を表示に使う。
   * comments.userName / reviews.userName は投稿時点のスナップショットとして
   * 保存されるが、表示時は src/lib/live-names.ts が常に現在のこの値へ
   * 解決し直すため、名前変更は過去の投稿の表示にも遡って反映される。
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
  /**
   * 単発購入（トークンパック）で得たトークン。**必ず tokenBalance とは別枠**。
   * tokenBalance は月次補充で「プラン予算に置き換え」られる(subscription.ts の
   * applyPlan / users.ts の applyTokenLifecycle)ため、購入分をそこへ加算すると
   * 次の補充時に実際に支払われた分が消滅する。金銭が絡む残高なので独立させる。
   */
  purchasedTokens: z.number().int().min(0).default(0),
  /** 購入トークンの失効予定日 (ISO)。購入から1年 (TOKEN_PACK.expiryMonths)。 */
  purchasedTokensExpiresAt: z.string().nullable().default(null),
  /**
   * 付与済みトークンパックの Stripe Checkout Session ID（新しい順・最大50件）。
   * 戻りルート(/api/token-pack/return)と Webhook はどちらも成功時に発火し、
   * 順序も保証されない。ここに ID があるかで二重付与を防ぐ（自然キーによる冪等化）。
   */
  tokenPackSessions: z.array(z.string()).max(50).default([]),
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
  /**
   * 広告メール配信への同意（特定電子メール法対応）。原則オプトインなので
   * 既定値は必ず false — サインアップ時のチェックボックス、またはマイページの
   * 設定変更でのみ true になる。
   */
  marketingConsent: z.boolean().default(false),
  /** 同意した日時（ISO）。null = 未同意、または同意後に取り消し済み。 */
  marketingConsentAt: z.string().nullable().default(null),
  /**
   * 配信停止リンク用のランダムトークン。ログイン不要でワンクリック配信停止
   * できるようにするため（メール内リンクはサインイン画面を経由させない）。
   * 同意した時に一度だけ発行し、以後は同じ値を使い続ける（推測不可な
   * ランダム文字列であることが安全性の根拠 — userId 由来の決定的な値にしない）。
   */
  unsubscribeToken: z.string().default(""),
  /**
   * ログイン端末数上限チェックを最後に行った時刻(ISO)。毎リクエストでは
   * Clerk Backend API を叩かず、一定時間おき(device-limit.ts)にだけ再チェック
   * するためのスロットル用。null = 未チェック。
   */
  deviceLimitCheckedAt: z.string().nullable().default(null),
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

/** Spendable token total = monthly balance + purchased packs + contribution tokens. */
export function totalTokens(
  u: Pick<User, "tokenBalance" | "bonusTokens"> & { purchasedTokens?: number },
): number {
  return u.tokenBalance + (u.purchasedTokens ?? 0) + (u.bonusTokens ?? 0);
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

/**
 * 物件掲示板への書き込み（投稿・返信）権限。
 * 閲覧・いいねはサインイン会員全員、書き込みは有料プラン（Individual / Studio / Team）限定（admin は常に可）。
 */
export function canPostToBoard(u: PublicUser | null): boolean {
  if (!u) return false;
  if (u.role === "admin") return true;
  // 「課金ユーザーなら書き込み可」— 当初は Studio/Team 限定だったが、
  // Individual も含む有料プラン全体に拡大（Free のみ閲覧限定のまま）。
  return u.status === "active" && u.plan !== "free";
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
