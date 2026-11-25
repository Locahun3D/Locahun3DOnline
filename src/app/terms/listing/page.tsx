import type { ReactNode } from "react";
import Link from "next/link";
import Jp from "@/components/jp";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { LISTING_TERMS_JA } from "./terms-ja";
import { LISTING_TERMS_EN } from "./terms-en";
import type { TermsArticle } from "./terms-types";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Scan and Listing Terms" : "スキャン・掲載規約｜ロケハン3D",
  };
}

/**
 * ロケハン3D スキャン・掲載規約（v2、2026-11-25 改定）。
 *
 * 本文は tou法律事務所 西村弁護士のレビュー版（３Dロケハン掲載規約v2_20261118.docx）を
 * そのまま terms-ja.ts に書き出したもの。掲載申込書は「本規約（https://locahun3d.com/terms/listing）
 * を契約内容とする」と参照しているので、このページの文言＝契約の文言。勝手に言い換えない。
 *   - 旧版（2026-10-08 施設掲載規約）は /terms/listing/2026-10-08 に保管
 *   - 分配の細目 → /terms/listing-revenue-share（本規約第10条・第11条が優先）
 *   - 購入者が守る条件 → /terms/data-download（第10条第6項の「データ購入規約」）
 *   - 第三者が撮って持ち込む場合 → /terms/submission（第1条第4項）
 * スタジオへの確認メールに同送するリンクは src/lib/terms-catalog.ts。
 */
export default async function ListingTermsPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const articles = en ? LISTING_TERMS_EN : LISTING_TERMS_JA;
  return (
    <div className="theme-online w-full max-w-3xl mx-auto px-6 ui-page-shell pb-12 sm:pb-32">
      <header className="ui-page-header">
        {en && (
          <p className="text-[14px] text-amber-400/80 mt-3 border border-amber-400/30 bg-amber-400/5 px-3 py-2 rounded">
            This English text is a reference translation. The Japanese version is the legally binding
            document and prevails in case of any discrepancy.
          </p>
        )}
        <h1 className="ui-page-title">{en ? "Locahun 3D Scan and Listing Terms" : "ロケハン3D スキャン・掲載規約"}</h1>
        <p className="ui-page-lead text-[14px] text-muted">
          {en ? (
            <>
              These terms set out the conditions on which Kawaii World Industries Inc. scans a facility,
              lists it on Locahun 3D and uses the resulting data. Applications are made with our listing
              application form, and these terms form part of the agreement.
            </>
          ) : (
            <>
              Kawaii World Industries株式会社（KWI株式会社）が施設をスキャンし、ロケハン3Dに掲載し、そのデータを利用する条件を定めるものです。
              <br />
              お申込みは当社所定の掲載申込書で行い、本規約は申込書とあわせて契約の内容となります。
            </>
          )}
        </p>
        <p className="text-[13px] mt-3 opacity-70">
          {en ? (
            <>
              These terms apply to applications made on or after 25 November 2026. For facilities listed
              before that date they apply from 25 December 2026; until then the{" "}
              <Link href={localizedHref("/terms/listing/2026-10-08", locale)} className="text-accent hover:underline">
                previous version (8 October 2026)
              </Link>{" "}
              applies.
            </>
          ) : (
            <>
              本規約は、2026年11月25日以後のお申込みに適用します。
              <br />
              同日より前から掲載中の施設には2026年12月25日から適用し、それまでは
              <Link href={localizedHref("/terms/listing/2026-10-08", locale)} className="text-accent hover:underline">
                旧版（2026年10月8日改定）
              </Link>
              を適用します。
            </>
          )}
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        {articles.map((a, i) => (
          <Article key={i} n={i + 1} article={a} en={en} />
        ))}

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            {en ? (
              <>
                Effective: 26 September 2026 (as the Facility Listing Terms)
                <br />
                Revised: 25 November 2026 (replaced in full by the Scan and Listing Terms reviewed by counsel: application by
                application form before the scan; listing, hosting and embedding free of charge; individual sale only with
                per-property permission; 20% revenue share settled half-yearly with consumption tax added; optional third-party
                provision for AI training with a 20% share; two-year term with three months&apos; notice; listing can be stopped at
                any time within five business days; continued listing of closed facilities)
                <br />
                Previous version:{" "}
                <Link href={localizedHref("/terms/listing/2026-10-08", locale)} className="hover:underline">
                  8 October 2026
                </Link>
                <br />
                Locahun 3D (operated by Kawaii World Industries Inc. (KWI Inc.))
              </>
            ) : (
              <>
                制定日: 2026年9月26日（施設掲載規約として）
                <br />
                改定日: 2026年11月25日（弁護士のレビューを経た「ロケハン3D スキャン・掲載規約」に全面改定。申込みはスキャン前の掲載申込書による／掲載・ホスティング・埋め込みは無償／単品販売は物件ごとの許諾がある場合に限る／分配は販売代金の20％に消費税相当額を加算し半期精算／AI学習用途の第三者提供は許可した場合に限り対価の20％を分配／契約期間2年・3か月前通知／掲載の停止はいつでも5営業日以内／閉鎖後の掲載継続 等）
                <br />
                旧版:{" "}
                <Link href={localizedHref("/terms/listing/2026-10-08", locale)} className="hover:underline">
                  2026年10月8日改定
                </Link>
                <br />
                ロケハン3D（運営：Kawaii World Industries株式会社（KWI株式会社））
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/contact/listing", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          {en ? "← Back to listing request" : "← 掲載依頼に戻る"}
        </Link>
      </div>
    </div>
  );
}

function Article({ n, article, en }: { n: number; article: TermsArticle; en: boolean }) {
  const heading = en ? `Article ${n} (${article.title})` : `第${n}条（${article.title}）`;
  const body = article.paras.map((p, j) => {
    const text = typeof p === "string" ? p : p.text;
    const items = typeof p === "string" ? [] : p.items;
    return (
      <div key={j}>
        <Text en={en}>{text}</Text>
        {items.length > 0 && (
          <ol className="mt-2 space-y-1 pl-2">
            {items.map((it, k) => (
              <li key={k} className="flex gap-2">
                <span className="shrink-0 tabular-nums">({k + 1})</span>
                <span className="min-w-0">
                  <Text en={en}>{it}</Text>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  });
  return (
    <section>
      <h2 className="ui-section-title mb-4">{heading}</h2>
      {article.numbered ? (
        <ol className="list-decimal pl-6 space-y-2 opacity-80">
          {body.map((b, j) => (
            <li key={j}>{b}</li>
          ))}
        </ol>
      ) : (
        <div className="space-y-2 opacity-80">{body}</div>
      )}
    </section>
  );
}

const URL_RE = /(https:\/\/locahun3d\.com\/[a-z0-9/_-]+)/;

/** 本文中の locahun3d.com の URL だけリンクにする。日本語は <Jp> で文節の途中で折らない。 */
function Text({ children, en }: { children: string; en: boolean }) {
  const parts = children.split(URL_RE);
  const out: ReactNode[] = parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <a key={i} href={(en ? "/en" : "") + part.replace("https://locahun3d.com", "")} className="text-accent hover:underline [overflow-wrap:anywhere]">
          {part}
        </a>
      );
    }
    if (!part) return null;
    return en ? <span key={i}>{part}</span> : <Jp key={i}>{part}</Jp>;
  });
  return <>{out}</>;
}
