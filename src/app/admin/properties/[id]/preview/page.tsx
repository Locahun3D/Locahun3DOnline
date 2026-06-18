import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { repo } from "@/lib/store";
import PropertyDetailView from "@/components/property-detail-view";

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

  return <PropertyDetailView property={property} others={others} preview />;
}
