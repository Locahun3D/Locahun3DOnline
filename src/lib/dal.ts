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

export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await userRepo.get(userId);
  if (existing) {
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
    tokenBalance: isAdmin ? 9999 : isGuest ? 0 : 1,
    // 登録時の無料1トークンは付与から1年で失効。admin/guest は対象外。
    tokenExpiresAt: !isAdmin && !isGuest ? oneYearFrom(now) : null,
    stripeCustomerId: null,
    bonusTokens: isGuest ? GUEST_BONUS_TOKENS : 0,
    ndaAcceptedAt: null,
    bookmarks: [],
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
