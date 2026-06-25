import { getPublishedProperties, getAllAreas } from "@/lib/properties";
import { getCurrentUser } from "@/lib/dal";
import CatalogClient from "@/components/properties/catalog-client";

export const metadata = {
  title: "物件を探す",
  description:
    "スタジオ・倉庫・住宅・店舗・屋外ロケ地を 3D Gaussian Splatting 付きで横断検索。撮影前に空間ごと持ち帰れます。",
};

export default async function PropertiesPage() {
  const items = await getPublishedProperties();
  const areas = await getAllAreas();
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

  return (
    <div className="theme-online">
      <CatalogClient
        items={items}
        areas={areas}
        studioTypes={studioTypes}
        bookmarkedIds={bookmarkedIds}
        signedIn={signedIn}
      />
    </div>
  );
}
