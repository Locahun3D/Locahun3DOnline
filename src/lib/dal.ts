/**
 * Data Access Layer — bridges Clerk identity to the app's user record.
 * `getCurrentUser` reads the Clerk session, lazily creates the app record on
 * first sign-in (bootstrapping admins by email), and is memoized per request.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { userRepo, isBootstrapAdminEmail } from "./users";
import {
  GUEST_BONUS_TOKENS,
  oneYearFrom,
  type PublicUser,
  type AccountRole,
} from "./account-schema";
import { SIGNUP_BONUS_TOKENS } from "./schemas";

export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await userRepo.get(userId);
  if (existing) {
    // Break-glass: ブートストラップ管理者メールのアカウントが（誤操作等で）降格/
    // 停止されても、再サインインで admin/active に自動回復させる。これが自己
    // ロックアウトからの唯一の復旧経路（停止中は通常 getCurrentUser が null）。
    if (
      isBootstrapAdminEmail(existing.email) &&
      (existing.role !== "admin" || existing.status !== "active")
    ) {
      return userRepo.upsert({
        ...existing,
        role: "admin",
        status: "active",
        updatedAt: new Date().toISOString(),
      });
    }
    if (existing.status === "suspended") return null;
    return existing;
  }

  // First authenticated visit — create the app record from the Clerk profile.
  const cu = await currentUser();
  const email = (cu?.primaryEmailAddress?.emailAddress ?? "").toLowerCase();
  const isAdmin = !!email && isBootstrapAdminEmail(email);
  // Role can be pre-seeded by a Clerk invitation (publicMetadata.role).
  // "guest" = invite-only 貢献特別枠 with non-expiring bonus tokens.
  const invitedRole =
    typeof cu?.publicMetadata?.role === "string"
      ? (cu.publicMetadata.role as string)
      : "";
  const isGuest = invitedRole === "guest";
  const name =
    cu?.fullName || cu?.firstName || (email ? email.split("@")[0] : "ユーザー");
  const now = new Date().toISOString();

  const role: AccountRole = isAdmin ? "admin" : isGuest ? "guest" : "individual";
  const created = await userRepo.upsert({
    id: userId,
    email: email || `${userId}@clerk.local`,
    name,
    role,
    status: "active",
    onboarded: isAdmin || isGuest, // admins and invited guests skip onboarding
    company: "",
    phone: "",
    plan: isAdmin ? "team" : "free",
    tokenBalance: isAdmin ? 9999 : isGuest ? 0 : SIGNUP_BONUS_TOKENS,
    // 登録時の無料トークンは付与から1年で失効。admin/guest は対象外。
    tokenExpiresAt: !isAdmin && !isGuest ? oneYearFrom(now) : null,
    // 登録時ボーナスは一回きり（月次補充の対象外）。有料プラン加入時に
    // applyPlan/webhook 側で改めてセットされる。
    tokenRefillAt: null,
    stripeCustomerId: null,
    bonusTokens: isGuest ? GUEST_BONUS_TOKENS : 0,
    ndaAcceptedAt: null,
    linkedPropertyIds: [],
    bookmarks: [],
    bookmarkFolders: [],
    bookmarkFolderAssignments: {},
    bookmarkTags: {},
    createdAt: now,
    updatedAt: now,
  });
  return created;
});

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Signed in AND completed onboarding (role chosen). */
export async function requireOnboarded(): Promise<PublicUser> {
  const user = await requireUser();
  if (!user.onboarded && user.role !== "admin") redirect("/onboarding");
  return user;
}

export async function requireRole(roles: AccountRole[]): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

export async function requireAdmin(): Promise<PublicUser> {
  return requireRole(["admin"]);
}

/**
 * Admin OR studio owner with at least one linked property.
 * Studio owners only see/edit their own properties — the caller must
 * further check `user.linkedPropertyIds.includes(propertyId)`.
 */
export async function requireAdminOrStudioOwner(): Promise<PublicUser> {
  return requireRole(["admin", "studio"]);
}

/**
 * 物件へのアクセス権を確認（admin、または所有/リンク済みの studio オーナーのみ）。
 * 編集ページ・編集アクションの両方で使い、studio オーナーが他社物件を
 * URL 直打ちで閲覧/編集できる IDOR を防ぐ。失敗時は throw。
 */
export async function assertPropertyAccess(propertyId: string): Promise<PublicUser> {
  const { repo } = await import("./store");
  const user = await getCurrentUser();
  if (!user) throw new Error("unauthorized");
  if (user.role === "admin") return user;
  const linked = user.linkedPropertyIds ?? [];
  const prop = await repo.get(propertyId);
  if (prop && (prop.ownerId === user.id || linked.includes(propertyId))) {
    return user;
  }
  throw new Error("forbidden");
}
