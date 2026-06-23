import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getPublishedProperty,
  getPublishedProperties,
  getPublishedPropertyIds,
} from "@/lib/properties";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
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
  let hasViewerAccess = false;
  let signedIn = false;
  const purchasedIndices: number[] = [];
  try {
    const user = await getCurrentUser();
    signedIn = !!user;
    canViewRestrictedItems = canViewBackyard(user);
    canViewNdaOnlyItems = canViewNdaOnly(user);
    // 管理者・有料サブスク会員はサインイン済みなら 3DGS を視聴可（paywall を出さない）。
    hasViewerAccess =
      !!user && (user.role === "admin" || (!!user.plan && user.plan !== "free"));
    if (user) {
      const mine = await purchaseRepo.list({ userId: user.id, propertyId: property.id });
      for (const p of mine) {
        if (p.status === "completed") purchasedIndices.push(p.splatItemIndex);
      }
    }
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
        purchasedIndices={purchasedIndices}
        hasViewerAccess={hasViewerAccess}
        signedIn={signedIn}
      />
    </>
  );
}
