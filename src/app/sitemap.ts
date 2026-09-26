import type { MetadataRoute } from "next";
import { getPublishedProperties } from "@/lib/properties";
import { listIndexableWorks } from "@/lib/works-seo";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com";

/**
 * 静的なマーケティング系ページ（会員専用・管理系は含めない）。
 * ja/en 両方のバリアントを出す。
 */
// ⚠ 2026-08-16: /about はトップの #service へ統合（redirect のみ）、/demo は /pricing へ
//   統合したので、どちらも sitemap には出さない（リダイレクト先だけを出す）。
// 2026-09-26: /data（3Dデータ販売の一覧）を追加。販売していることを検索に伝える入口。
const STATIC_PATHS = ["/", "/properties", "/data", "/pricing"];

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

  // works（実績＆技術ブログ）も載せる（2026-09-26 本人指示）。URLは本体ホスト側の正典URL。
  // 旧 web.locahun3d.com のURLはそのまま配り続けるが、サイトマップには正典だけを出す。
  const works = await listIndexableWorks();
  const worksEntries: MetadataRoute.Sitemap = works.flatMap((w) => [
    {
      url: `${SITE_URL}/works/${w.slug}.html`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    ...(w.hasEn
      ? [
          {
            url: `${SITE_URL}/en/works/${w.slug}.html`,
            lastModified: now,
            changeFrequency: "monthly" as const,
            priority: 0.5,
          },
        ]
      : []),
  ]);

  return [...staticEntries, ...propertyEntries, ...worksEntries];
}
