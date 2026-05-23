import { getPublishedProperties, getAllAreas } from "@/lib/properties";
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

  return <CatalogClient items={items} areas={areas} studioTypes={studioTypes} />;
}
