import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com";

/**
 * 会員専用・管理系・APIはクロール対象外にする。公開マーケティングページ
 * (/, /properties, /properties/[id], /pricing, /about とその /en 版) のみ許可。
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
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
