import { getPublishedProperties } from "@/lib/properties";
import { getCurrentUser } from "@/lib/dal";
import { reviewStatsForProperties } from "@/lib/reviews";
import { localizeProperty } from "@/lib/schemas";
import { getLocale } from "@/lib/i18n/server";
import CatalogClient from "@/components/properties/catalog-client";
import SimilarPropertySearch from "@/components/properties/similar-property-search";

export async function generateMetadata() {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "Browse Locations",
        description:
          "Search studios, warehouses, houses, shops and outdoor locations — each with a 3D Gaussian Splatting scan you can walk before the shoot.",
      }
    : {
        title: "物件を探す",
        description:
          "スタジオ・倉庫・住宅・店舗・屋外ロケ地を 3D Gaussian Splatting 付きで横断検索。撮影前に空間ごと持ち帰れます。",
      };
}

export default async function PropertiesPage() {
  const locale = await getLocale();
  const items = (await getPublishedProperties()).map((p) => localizeProperty(p, locale));
  const areas = Array.from(new Set(items.map((p) => p.area))).sort();
  const studioTypes = Array.from(
    new Set(items.map((p) => p.studioType).filter((s) => s)),
  ).sort();

  let bookmarkedIds: string[] = [];
  let signedIn = false;
  try {
    const user = await getCurrentUser();
    signedIn = !!user;
    bookmarkedIds = user?.bookmarks ?? [];
  } catch {
    // ビルド時など認証コンテキストなし
  }

  // カード上の★平均表示用。1クエリ(D1)/1回のlist(JSON)で全物件分まとめて取得する。
  const reviewStats = await reviewStatsForProperties(items.map((p) => p.id)).catch(
    () => ({}) as Record<string, { average: number; count: number }>,
  );

  return (
    <div className="theme-online">
      <div className="frame-wide pt-5">
        <SimilarPropertySearch />
      </div>
      <CatalogClient
        items={items}
        areas={areas}
        studioTypes={studioTypes}
        bookmarkedIds={bookmarkedIds}
        signedIn={signedIn}
        reviewStats={reviewStats}
      />
    </div>
  );
}
