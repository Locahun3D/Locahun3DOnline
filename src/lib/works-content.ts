/**
 * works（実績＆技術ブログ）の記事コンテンツ。
 *
 * 実体は content/works/{ja,en}/<slug>.json（`node scripts/import-works.mjs` が
 * digiroke3d_Web の静的HTMLから生成）。Cloudflare Workers にファイルシステムは
 * 無いので、src/content/works.generated.ts が静的 import で束ねてバンドルに焼く。
 *
 * ⚠ URL は不変（本人指示 2026-08-16、X で共有済み）:
 *      /works/<slug>.html ・ /en/works/<slug>.html
 *   slug は取り込み元のファイル名そのまま。ここで作り替えないこと。
 */
import { WORKS_PAGES } from "@/content/works.generated";
import type { Locale } from "@/lib/i18n/dictionaries";

export type WorksPage = {
  locale: string;
  title: string;
  description: string | null;
  canonical: string | null;
  /** 取り込み元が読んでいた Google Fonts の URL（記事ごとに family が違う）。 */
  fontsHref: string | null;
  /** 統合先へ転送するだけのページ（旧 blog.html 等）。 */
  redirectTo: string | null;
  og: {
    type: string | null;
    title: string | null;
    description: string | null;
    url: string | null;
    image: string | null;
    siteName: string | null;
  };
  twitter: {
    card: string | null;
    title: string | null;
    description: string | null;
    image: string | null;
  };
  /** `.works-root` にスコープ済みのページCSS。 */
  css: string;
  /** 静的ヘッダー/フッターを除いた本文（スクリプト込み）。 */
  bodyHtml: string;
};

/** `index.html` → `index`。`.html` が無いものは null（＝404 のまま）。 */
export function slugFromPageParam(param: string): string | null {
  const m = /^([A-Za-z0-9_-]+)\.html$/.exec(param);
  return m ? m[1] : null;
}

/**
 * 記事を引く。EN が無い slug は **JA へフォールバックしない**（英語ページとして
 * 存在しないものを日本語で出すと言語トグルと食い違うため）。
 */
export function getWorksPage(locale: Locale, slug: string): WorksPage | null {
  return WORKS_PAGES[locale]?.[slug] ?? null;
}

/** 記事一覧（管理画面用）。JA 側の slug を正とする。 */
export function listWorksSlugs(): { slug: string; title: string; hasEn: boolean }[] {
  return Object.entries(WORKS_PAGES.ja)
    .map(([slug, page]) => ({
      slug,
      title: page.title,
      hasEn: Boolean(WORKS_PAGES.en[slug]),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * ゲーティングの対象外（一覧・転送ページ）。
 * 旧 worker.js の `worksMatch[1] !== "index" && !== "blog" && !== "admin"` と同じ扱い。
 */
export const UNGATED_SLUGS = new Set(["index", "blog"]);
