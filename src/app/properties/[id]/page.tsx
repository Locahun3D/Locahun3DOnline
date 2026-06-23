import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getPublishedProperty,
  getPublishedProperties,
  getPublishedPropertyIds,
} from "@/lib/properties";
import { getCurrentUser } from "@/lib/dal";
import { canViewBackyard, canViewNdaOnly } from "@/lib/account-schema";
import PropertyDetailView from "@/components/property-detail-view";
import TrackView from "@/components/track-view";
import PurchaseToast from "@/components/purchase-toast";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";

// 限定無料期間 (getSettings) と現在時刻を毎リクエストで読むため動的レンダリング。
// これにより静的生成ワーカーを使わず、無料期間の開始/終了も常に即時反映される。
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await getPublishedProperty(id);
  if (!p) return { title: "Not found" };
  return {
    title: p.title,
    description: p.summary,
    openGraph: { images: [p.cover.src] },
  };
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await getPublishedProperty(id);
  if (!property) notFound();

  const others = (await getPublishedProperties())
    .filter((p) => p.id !== property.id)
    .slice(0, 3);

  const settings = await getSettings();
  const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());

  let canViewRestrictedItems = false;
  let canViewNdaOnlyItems = false;
  try {
    const user = await getCurrentUser();
    canViewRestrictedItems = canViewBackyard(user);
    canViewNdaOnlyItems = canViewNdaOnly(user);
  } catch {
    // No auth context (build time) — treat as no access
  }

  return (
    <>
      <Suspense>
        <PurchaseToast />
      </Suspense>
      <TrackView propertyId={property.id} />
      <PropertyDetailView
        property={property}
        others={others}
        freeAccess={freeAccess}
        canViewRestricted={canViewRestrictedItems}
        canViewNdaOnly={canViewNdaOnlyItems}
      />
    </>
  );
}
