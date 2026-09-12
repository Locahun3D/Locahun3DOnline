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
import { previewViewerState } from "@/lib/preview-viewer-state";

export const metadata = { title: "プレビュー" };

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
  const admin = await requireAdmin();
  const { id } = await params;
  const { plan: rawPlan } = await searchParams;
  const property = await repo.get(id);
  if (!property) notFound();

  const plan: PreviewPlan = PREVIEW_PLAN_OPTIONS.some((o) => o.value === rawPlan)
    ? (rawPlan as PreviewPlan)
    : "admin";
  const sim = previewViewerState(plan, admin);

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
      {...sim}
      previewControls={
        <PlanPreviewSwitcher plan={plan} freeAccessActive={freeAccess} />
      }
    />
  );
}
