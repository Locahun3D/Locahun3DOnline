import type { MetadataRoute } from "next";
import { getPublishedProperties } from "@/lib/properties";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com";

/**
 * 静的なマーケティング系ページ（会員専用・管理系は含めない）。
 * ja/en 両方のバリアントを出す。
 */
// ⚠ 2026-08-16: /about はトップの #service へ統合（redirect のみ）、/demo は /pricing へ
//   統合したので、どちらも sitemap には出さない（リダイレクト先だけを出す）。
const STATIC_PATHS = ["/", "/properties", "/pricing"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const properties = await getPublishedProperties();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.flatMap((path) => [
    {
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: path === "/" ? "daily" : "weekly",
      priority: path === "/" ? 1 : 0.7,
    },
    {
      url: `${SITE_URL}/en${path === "/" ? "" : path}`,
      lastModified: now,
      changeFrequency: path === "/" ? "daily" : "weekly",
      priority: path === "/" ? 0.9 : 0.6,
    },
  ]);

  const propertyEntries: MetadataRoute.Sitemap = properties.flatMap((p) => [
    {
      url: `${SITE_URL}/properties/${p.id}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/en/properties/${p.id}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ]);

  return [...staticEntries, ...propertyEntries];
}
