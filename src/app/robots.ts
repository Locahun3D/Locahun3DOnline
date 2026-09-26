import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com";

/**
 * 会員専用・管理系・APIはクロール対象外にする。公開マーケティングページ
 * (/, /properties, /properties/[id], /pricing とその /en 版) のみ許可。
 * ⚠ 2026-08-16: /about は / の #service へ、/demo は /pricing へ統合（redirect のみ）。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/admin/",
        "/dashboard",
        "/dashboard/",
        "/account",
        "/account/",
        "/api/",
        "/onboarding",
        "/cart",
        "/sign-in",
        "/sign-up",
        // 2026-09-26: works（実績＆技術ブログ）はクロール可にした（本人指示）。
        // 記事ごとの非公開は KV ゲーティング＋各ページの robots で制御する。
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
