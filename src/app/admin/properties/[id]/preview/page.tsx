import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { repo } from "@/lib/store";
import PropertyDetailView from "@/components/property-detail-view";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";

export const metadata = { title: "プレビュー" };

/**
 * Admin-only preview of a property in ANY status (draft/published/archived).
 * Renders the exact public detail layout so the operator can verify a draft
 * before publishing.
 */
export default async function PropertyPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const property = await repo.get(id);
  if (!property) notFound();

  const others = (await repo.list())
    .filter((p) => p.id !== property.id && p.status === "published")
    .slice(0, 3);

  const settings = await getSettings();
  const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());

  // 管理プレビューは requireAdmin を通っている＝必ずサインイン済み。signedIn を
  // 渡さないと ViewerGate が「既にメンバーの方はサインイン」ボタンを出してしまう。
  return (
    <PropertyDetailView property={property} others={others} preview freeAccess={freeAccess} signedIn />
  );
}
