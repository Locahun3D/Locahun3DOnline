import { canViewBackyard, canViewNdaOnly, type PublicUser } from "./account-schema";
import type { PreviewPlan } from "@/components/admin/plan-preview-options";

/** Display-only persona; never used to authorize a request or impersonate a user. */
export function previewViewerState(plan: PreviewPlan, admin: PublicUser) {
  const user: PublicUser | null = plan === "guest" ? null : plan === "admin" ? admin : {
    ...admin,
    role: plan === "team" || plan === "team_nda" ? "production" : "individual",
    status: "active",
    plan: plan === "team_nda" ? "team" : plan,
    ndaAcceptedAt: plan === "team_nda" ? "2026-01-01T00:00:00.000Z" : null,
  };
  return {
    signedIn: !!user,
    hasViewerAccess: !!user,
    canViewRestricted: canViewBackyard(user),
    canViewNdaOnly: canViewNdaOnly(user),
    isAdminUser: user?.role === "admin",
    displaySimulation: plan !== "admin",
  };
}
