import "server-only";
import { listWorksSlugs, UNGATED_SLUGS } from "./works-content";
import { getWorksMeta, listWorksMeta } from "./works-gating";
import { WORKS_PAGES } from "@/content/works.generated";

/**
 * works（実績＆技術ブログ）を検索に載せるための判断（2026-09-26 本人指示
 * 「サイトマップのURLに works をコピーして移動／旧ページのURLはそのままにしつつ、移行する」）。
 *
 * ── 何が変わったか ──────────────────────────────────────
 * これまで works は全ページ noindex で、サイトマップにも出していなかった。
 * 積み上がるはずの記事が検索の資産にならず、「3Dデータ」「3D Gaussian Splatting」等で
 * サイトが出てこない一因になっていた。
 *
 * ── 壊さないこと ────────────────────────────────────────
 *  - 旧URL `https://web.locahun3d.com/works/<slug>.html` は今までどおり配る（301にしない）。
 *  - 正典URL(canonical)は本体ホスト `https://locahun3d.com/works/<slug>.html` に置き、
 *    評価を1ドメインへ寄せる。
 *  - KV で「公開」以外（下書き・限定公開・削除）の記事と、転送ページは従来どおり出さない。
 */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com";

export function worksUrl(slug: string, locale: "ja" | "en"): string {
  return `${SITE_URL}${locale === "en" ? "/en" : ""}/works/${slug}.html`;
}

/** この記事を検索に出してよいか（公開中＝KV が published、または一覧・転送の常時公開分）。 */
export async function isWorksIndexable(slug: string): Promise<boolean> {
  if (UNGATED_SLUGS.has(slug)) return true;
  const meta = await getWorksMeta(slug);
  return meta.status === "published";
}

export interface WorksSitemapEntry {
  slug: string;
  hasEn: boolean;
}

/**
 * サイトマップに出す記事。転送ページ（旧 blog.html 等）と非公開は外す。
 * KV が無い環境（dev）では listWorksMeta が空を返し、既定の "published" 扱いになる。
 */
export async function listIndexableWorks(): Promise<WorksSitemapEntry[]> {
  const stored = await listWorksMeta();
  return listWorksSlugs()
    .filter(({ slug }) => !WORKS_PAGES.ja[slug]?.redirectTo)
    .filter(({ slug }) => {
      if (UNGATED_SLUGS.has(slug)) return true;
      return (stored[slug]?.status ?? "published") === "published";
    })
    .map(({ slug, hasEn }) => ({ slug, hasEn }));
}
