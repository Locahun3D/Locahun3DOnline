import { permanentRedirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";

/**
 * /about — 2026-08-16 にトップページ `/` の `#service` セクションへ統合
 *（本人指示: 「サービスについて」はページではなくトップ内の見出しへ昇格）。
 *
 * - 中身（立場別セグメント3枚・中核技術・4列フロー・仕組み3ステップ・機能の詳細9行）は
 *   `src/app/page.tsx` へそのまま移設。CSS は共有の `src/lib/design/about07-css.ts`。
 * - 外部（検索結果・過去に共有されたリンク）から来る人のために、このルートは
 *   `/#service`（EN: `/en#service`）への恒久リダイレクトとして残す。
 * - EN は middleware が /en/about → /about に rewrite して x-locale=en を渡すので、
 *   locale を見て着地先を出し分ける。
 * - リダイレクトするだけなので generateMetadata は持たない。
 */
export default async function AboutPage() {
  const locale = await getLocale();
  permanentRedirect(locale === "en" ? "/en#service" : "/#service");
}
