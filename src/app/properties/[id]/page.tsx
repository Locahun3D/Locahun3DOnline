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
import { getLocale } from "@/lib/i18n/server";

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
  // og:image は SNS のクローラが外部から取得するため絶対URL必須。cover が
  // 相対（/api/r2/… や /uploads/…、R2非公開化後の配信経路）だと取得できないので
  // サイトオリジンを前置して絶対化する。
  const site = process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com";
  const cover = p.cover?.src;
  const ogImage = cover
    ? cover.startsWith("http")
      ? cover
      : `${site}${cover.startsWith("/") ? "" : "/"}${cover}`
    : undefined;
  return {
    title: p.title,
    description: p.summary,
    openGraph: ogImage ? { images: [ogImage] } : undefined,
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

  const locale = await getLocale();

  const [allPublished, settings, user] = await Promise.all([
    getPublishedProperties(),
    getSettings(),
    getCurrentUser().catch(() => null),
  ]);

  const others = allPublished.filter((p) => p.id !== property.id).slice(0, 3);
  const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());

  const canViewRestrictedItems = canViewBackyard(user);
  const canViewNdaOnlyItems = canViewNdaOnly(user);
  const hasViewerAccess =
    !!user && (user.role === "admin" || (!!user.plan && user.plan !== "free"));
  const signedIn = !!user;
  const bookmarked = user ? (user.bookmarks ?? []).includes(property.id) : false;
  const purchasedIndices: number[] = [];
  if (user) {
    try {
      const mine = await purchaseRepo.list({ userId: user.id, propertyId: property.id });
      for (const p of mine) {
        if (p.status === "completed") purchasedIndices.push(p.splatItemIndex);
      }
    } catch {
      // purchase lookup failure is non-fatal
    }
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
        bookmarked={bookmarked}
        locale={locale}
      />
    </>
  );
}
