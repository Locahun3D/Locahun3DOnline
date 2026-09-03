import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/dal";
import {
  getWorksPage,
  slugFromPageParam,
  UNGATED_SLUGS,
  type WorksPage,
} from "@/lib/works-content";
import { canViewWorks, getWorksMeta } from "@/lib/works-gating";

/**
 * /works/<slug>.html （EN は /en/works/<slug>.html）
 *
 * ⚠ URL は1文字も変えない（本人指示 2026-08-16）。`.html` 付きが正典で、
 *   拡張子なし（/works/index）は 404 のまま＝別URLを生やさない。
 *
 * 本文は取り込み済みの生HTML（content/works/**）をそのまま出す。中に
 * <script>（カード生成・ライトボックス・BudouX）が入っているが、SSR された
 * HTML はブラウザのパーサが実行するので普通に動く（React が innerHTML を
 * 差し替えるわけではない）。works 内のリンクは素の <a> なので常にフルロード。
 */

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ page: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(pageParam: string): Promise<{ slug: string; page: WorksPage } | null> {
  const slug = slugFromPageParam(pageParam);
  if (!slug) return null;
  const locale = await getLocale();
  const page = getWorksPage(locale, slug);
  return page ? { slug, page } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page: pageParam } = await params;
  const found = await load(pageParam);
  if (!found) return { title: "Not Found", robots: { index: false, follow: false } };
  const { slug, page } = found;
  const jaUrl = `https://web.locahun3d.com/works/${slug}.html`;
  const enUrl = `https://web.locahun3d.com/en/works/${slug}.html`;

  return {
    // ルート layout の template（"%s｜ロケハン3D オンライン"）を当てない。
    // 取り込み元の <title> をそのまま出す（X で共有済みの見え方を変えないため）。
    title: { absolute: page.title },
    description: page.description ?? undefined,
    // works は従来どおり全ページ noindex（sitemap にも出さない）。
    robots: { index: false, follow: false },
    alternates: {
      canonical: page.canonical ?? undefined,
      languages: { ja: jaUrl, en: enUrl, "x-default": jaUrl },
    },
    openGraph: {
      type: page.og.type === "article" ? "article" : "website",
      siteName: page.og.siteName ?? undefined,
      title: page.og.title ?? page.title,
      description: page.og.description ?? page.description ?? undefined,
      url: page.og.url ?? undefined,
      images: page.og.image ? [{ url: page.og.image, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: page.twitter.card === "summary" ? "summary" : "summary_large_image",
      title: page.twitter.title ?? page.title,
      description: page.twitter.description ?? page.description ?? undefined,
      images: page.twitter.image ? [page.twitter.image] : undefined,
    },
  };
}

export default async function WorksArticlePage({ params, searchParams }: Props) {
  const { page: pageParam } = await params;
  const found = await load(pageParam);
  if (!found) notFound();
  const { slug, page } = found;

  // 旧 blog.html / shibuya-ten-simulations.html は meta refresh の転送ページだった。
  // サーバー側リダイレクトに置き換える（行き先URLは変えない）。
  if (page.redirectTo) redirect(page.redirectTo);

  if (!UNGATED_SLUGS.has(slug)) {
    const sp = await searchParams;
    const rawToken = sp.token;
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    const [meta, user] = await Promise.all([getWorksMeta(slug), getCurrentUser()]);
    if (!canViewWorks(meta, { token: token ?? null, isAdmin: user?.role === "admin" })) {
      notFound();
    }
  }

  return (
    <>
      {/* 取り込み元と同じ Google Fonts を読む（記事ごとに family が違う）。
          React 19 が <link> を head へ持ち上げる。next/font を使わないのは、
          works が明朝(Noto Serif JP)を使う一方オンライン版本体は明朝禁止で、
          共通のフォント設定に混ぜたくないため。 */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {page.fontsHref && <link rel="stylesheet" href={page.fontsHref} />}
      <style dangerouslySetInnerHTML={{ __html: page.css }} />
      {/* suppressHydrationWarning は必須。本文に同梱の <script>（カード生成・
          BudouX の文節分割・ライトボックス）は SSR された HTML をブラウザが
          パースする時点で走り、hydration より先に DOM を書き換える。React は
          dangerouslySetInnerHTML のノードでも innerHTML の一致を見るため、
          抑止しないと毎ページ hydration mismatch を出す（実害は無いが dev
          オーバーレイが常時エラー表示になり、本物の不具合を隠す）。 */}
      <div
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
      />
    </>
  );
}
