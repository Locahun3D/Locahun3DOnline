/**
 * 掲載依頼（/contact/listing）の導線判定。
 *
 * ページ側に散らすと「所有者チェックを1箇所直し忘れる」が起きるので、
 * 判定だけをここに集めて純粋関数にし、テストで固定する。
 * 実際の権限強制はサーバーアクション側（requestPublishAction の
 * assertPropertyAccess）が行う。ここは**表示を出し分けるための判定**であり、
 * 二重防御の外側にあたる。
 */

/** 掲載ページを作れる種別か。撮影スタジオは自己申告で登録できる種別。 */
export function canCreateListing(role: string | undefined | null): boolean {
  return role === "studio" || role === "admin";
}

/** 掲載依頼ページで出す案内のステップ。 */
export type ListingStep =
  /** 未ログイン: スタジオ用アカウントを作る */
  | "signup"
  /** 個人アカウント＋会社ドメインのメール: 今のアカウントをそのままスタジオにする */
  | "convert"
  /** それ以外の非スタジオ: 別途スタジオ用アカウントを作る */
  | "switch"
  /** スタジオ/管理者: 物件ページを作る */
  | "create"
  /** エディターから物件を持って来た: 公開を申請する */
  | "request";

export function listingStep(
  role: string | undefined | null,
  hasPrefill: boolean,
): ListingStep {
  if (hasPrefill) return "request";
  if (!role) return "signup";
  return canCreateListing(role) ? "create" : "switch";
}

/**
 * ログイン中のアカウントを、その場でスタジオへ切り替えてよいか。
 *
 * ── なぜ必要か ────────────────────────────────────────────
 * 「スタジオアカウントを作成」は Clerk の /sign-up へ送るが、
 * **ログイン済みだと Clerk がサインアップ画面を出さずマイページへ弾く**
 * （ユーザー報告: 押すとマイページに飛ばされる）。
 * かといって常に「別アカウントを作れ」と案内するのも、会社のメールアドレスで
 * すでにログインしている人には二重登録を強いるだけになる。
 *
 * 撮影スタジオは元々 SELF_SIGNUP_ROLES＝新規登録時に自己申告できる種別なので、
 * 同じ条件（会社ドメインのメール）を満たすなら、あとから切り替えても
 * 審査の厳しさは変わらない。よって
 *   個人アカウント × 会社ドメインのメール → その場で切り替え
 *   それ以外                              → 別アカウント作成へ案内
 * とする。
 *
 * ⚠ 制作会社(production)は対象外。NDA締結済みの種別なので、切り替えると
 *   その権限を失う。別アカウントを作ってもらう。
 * ⚠ isFreeEmail の判定は呼び出し側から渡す（この関数を純粋に保つため）。
 */
export function canConvertToStudio(
  role: string | undefined | null,
  isFreeEmail: boolean,
): boolean {
  return role === "individual" && !isFreeEmail;
}

/** 所有者判定に必要な最小限の形（Property / PublicUser 全体を要求しない）。 */
export interface OwnershipUser {
  id: string;
  role: string;
  name?: string | null;
  linkedPropertyIds?: string[] | null;
}
export interface OwnershipProperty {
  id: string;
  ownerId?: string | null;
  title?: string | null;
  prefecture?: string | null;
  city?: string | null;
}

/**
 * その物件の公開申請をこのユーザーに出させてよいか。
 * admin は全件、studio は「自分が所有者」または「紐づけ済み」のみ。
 */
export function ownsProperty(
  user: OwnershipUser | null | undefined,
  property: OwnershipProperty | null | undefined,
): boolean {
  if (!user || !property) return false;
  if (user.role === "admin") return true;
  if (!canCreateListing(user.role)) return false;
  if (property.ownerId && property.ownerId === user.id) return true;
  return (user.linkedPropertyIds ?? []).includes(property.id);
}

export interface ListingPrefill {
  propertyId: string;
  company: string;
  propertyName: string;
  address: string;
}

/**
 * 公開申請モードの初期値。所有していなければ undefined を返し、
 * URL の ?property= は無視される（他人の物件名を覗けないようにする）。
 */
export function resolveListingPrefill(
  user: OwnershipUser | null | undefined,
  property: OwnershipProperty | null | undefined,
): ListingPrefill | undefined {
  if (!ownsProperty(user, property)) return undefined;
  return {
    propertyId: property!.id,
    company: user!.name ?? "",
    propertyName: property!.title ?? "",
    address: [property!.prefecture, property!.city].filter(Boolean).join(""),
  };
}
