import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { repo } from "@/lib/store";
import PropertyDetailView from "@/components/property-detail-view";
import PlanPreviewSwitcher from "@/components/admin/plan-preview-switcher";
import {
  PREVIEW_PLAN_OPTIONS,
  type PreviewPlan,
} from "@/components/admin/plan-preview-options";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";

export const metadata = { title: "プレビュー" };

/**
 * プランごとの閲覧フラグを再現する（本番の /properties/[id] と同じロジックを
 * シミュレーション: hasViewerAccess = サインイン済みか（トークン保有量は
 * このシミュレーターでは再現しないため、実際に開けるかは残高次第）、
 * restricted = Team、nda_only = Team + NDA 締結済み）。
 */
function simulateFlags(plan: PreviewPlan) {
  switch (plan) {
    case "guest":
      return { signedIn: false, hasViewerAccess: false, canViewRestricted: false, canViewNdaOnly: false };
    case "free":
      return { signedIn: true, hasViewerAccess: true, canViewRestricted: false, canViewNdaOnly: false };
    case "individual":
    case "studio":
      return { signedIn: true, hasViewerAccess: true, canViewRestricted: false, canViewNdaOnly: false };
    case "team":
      return { signedIn: true, hasViewerAccess: true, canViewRestricted: true, canViewNdaOnly: false };
    case "team_nda":
      return { signedIn: true, hasViewerAccess: true, canViewRestricted: true, canViewNdaOnly: true };
    default:
      return null; // admin = 実際の状態（従来どおり）
  }
}

/**
 * Admin-only preview of a property in ANY status (draft/published/archived).
 * Renders the exact public detail layout so the operator can verify a draft
 * before publishing. `?plan=` でサブスクプラン別の見え方を再現できる。
 */
export default async function PropertyPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { plan: rawPlan } = await searchParams;
  const property = await repo.get(id);
  if (!property) notFound();

  const plan: PreviewPlan = PREVIEW_PLAN_OPTIONS.some((o) => o.value === rawPlan)
    ? (rawPlan as PreviewPlan)
    : "admin";
  const sim = simulateFlags(plan);

  const others = (await repo.list())
    .filter((p) => p.id !== property.id && p.status === "published")
    .slice(0, 3);

  const settings = await getSettings();
  const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());

  // 管理プレビューは requireAdmin を通っている＝必ずサインイン済み。signedIn を
  // 渡さないと ViewerGate が「既にメンバーの方はサインイン」ボタンを出してしまう。
  return (
    <PropertyDetailView
      property={property}
      others={others}
      preview
      freeAccess={freeAccess}
      signedIn={sim ? sim.signedIn : true}
      hasViewerAccess={sim ? sim.hasViewerAccess : false}
      canViewRestricted={sim ? sim.canViewRestricted : false}
      canViewNdaOnly={sim ? sim.canViewNdaOnly : false}
      previewControls={
        <PlanPreviewSwitcher plan={plan} freeAccessActive={freeAccess} />
      }
    />
  );
}
