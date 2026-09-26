import Link from "next/link";
import { getPublishedProperties } from "@/lib/properties";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { listDataSales, summarizeDataSales, type DataSaleEntry } from "@/lib/data-catalog";
import { categoryLabel, dataLicenseLabel } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com";

/**
 * /data — 3Dスキャンデータの販売一覧（2026-09-26 本人指示「販売一覧ページ /data を新設」）。
 *
 * なぜ要るか: 販売しているのに、それが物件ページの奥にしか書かれておらず、
 * 検索でも人でも「3Dデータを売っている場所」だと分からなかった
 * （本人「渋谷3Dデータと打っても出てこないのはなぜか」「3D販売サイトとしても認知されるには」）。
 * タイトル・説明・見出し・構造化データに、買う人が実際に打つ言葉
 * （3Dデータ / 3Dスキャン / PLY / OBJ / ダウンロード / 販売）を置く。
 *
 * 一覧の中身は lib/data-catalog.ts（純関数・テストあり）。ここは表示だけ。
 */
export async function generateMetadata() {
  const locale = await getLocale();
  const en = locale === "en";
  return {
    // ルート layout の template（"%s｜ロケハン3D オンライン"）を当てない。
    // 検索結果で「ロケハン3D」が二重になるのを避ける。
    title: {
      absolute: en
        ? "3D Scan Data for Sale｜PLY & OBJ of real locations｜Locahun 3D"
        : "3Dスキャンデータ販売｜実写ロケ地のPLY・OBJダウンロード｜ロケハン3D",
    },
    description: en
      ? "Buy 3D scan data (PLY / OBJ) of real studios, streets and locations in Japan, captured with 3D Gaussian Splatting. Licensed for commercial productions, downloaded as files you keep."
      : "実写のスタジオ・街・ロケ地を3Dスキャンしたデータ（PLY・OBJ）のダウンロード販売。3D Gaussian Splatting で撮影した実空間を、商用制作に使えるライセンス付きで購入できます。",
    alternates: { canonical: `${SITE_URL}${en ? "/en" : ""}/data` },
  };
}

export default async function DataSalesPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  const entries = listDataSales(await getPublishedProperties(), new Date().toISOString());
  const summary = summarizeDataSales(entries);
  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

  return (
    <div className="theme-online frame ui-page-shell pb-12 sm:pb-32">
      {/* 検索エンジンに「商品の一覧」と伝える。価格・在庫はページの表示と同じ値を入れる。 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd(entries, en)) }}
      />

      <header className="ui-page-header">
        <div className="mono text-[11px] tracking-[0.3em] uppercase text-muted mb-4">
          3D scan data for sale
        </div>
        <h1 className="ui-page-title">
          {en ? (
            <>
              3D scan data
              <br />
              of real locations
            </>
          ) : (
            <>
              実写ロケ地の
              <br />
              3Dスキャンデータ販売
            </>
          )}
        </h1>
        <p className="ui-page-lead text-[14px] text-muted max-w-[62ch]">
          {en ? (
            <>
              Studios, streets and locations in Japan, captured on site with 3D Gaussian Splatting.
              <br />
              Buy the data as PLY / OBJ files and use it in your own productions.
              <br />
              {summary.count > 0 &&
                `${summary.count} scene${summary.count > 1 ? "s" : ""} available${
                  summary.freeCount > 0 ? `, ${summary.freeCount} free` : ""
                }.`}
            </>
          ) : (
            <>
              スタジオ・街・ロケ地を現地で3Dスキャンしたデータを販売しています。
              <br />
              PLY・OBJ 形式でダウンロードし、映像・ゲーム・VFX の制作にそのままお使いいただけます。
              <br />
              {summary.count > 0 &&
                `現在 ${summary.count}シーン${summary.freeCount > 0 ? `（うち ${summary.freeCount}シーンは無料配布）` : ""}。`}
              {summary.minPrice > 0 && `価格は ${yen(summary.minPrice)}（税込）から。`}
            </>
          )}
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-[14px] text-muted">
          {en
            ? "No scenes are on sale right now."
            : "現在、販売中のシーンはありません。"}
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <li key={`${e.propertyId}-${e.sceneId}`} className="border border-line">
              <Link href={lh(e.href)} className="block group">
                {/* next/image は使わない（Workers + 相対パスで最適化が404になる。CLAUDE.md） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={e.cover.src}
                  alt={e.cover.alt}
                  width={800}
                  height={500}
                  className="w-full h-[180px] object-cover"
                  loading="lazy"
                />
                <div className="p-4 space-y-2">
                  <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted">
                    {categoryLabel(e.category, locale)} ・ {e.prefecture}
                    {e.city ? ` ${e.city}` : ""}
                  </div>
                  <h2 className="text-[15px] font-bold leading-[1.5] group-hover:text-accent transition">
                    {e.propertyTitle}
                  </h2>
                  <div className="text-[13px] text-muted leading-[1.7]">{e.sceneLabel}</div>
                  <div className="text-[15px] font-bold">
                    {e.free ? (
                      <span className="text-accent">{en ? "Free download" : "無料配布"}</span>
                    ) : (
                      <>
                        {yen(e.price)}
                        <span className="text-[12px] font-normal text-muted">
                          {en ? " incl. tax ~" : "（税込）〜"}
                        </span>
                      </>
                    )}
                  </div>
                  <dl className="text-[12px] text-muted leading-[1.8]">
                    {e.formats.length > 0 && (
                      <div>
                        <dt className="inline">{en ? "Formats: " : "形式: "}</dt>
                        <dd className="inline">{e.formats.join(" / ")}</dd>
                      </div>
                    )}
                    {e.licenses.length > 0 && (
                      <div>
                        <dt className="inline">{en ? "License: " : "ライセンス: "}</dt>
                        <dd className="inline">
                          {e.licenses.map((l) => dataLicenseLabel(l as never, locale)).join(" / ")}
                        </dd>
                      </div>
                    )}
                    {e.sizeMb > 0 && (
                      <div>
                        <dt className="inline">{en ? "Size: " : "容量: "}</dt>
                        <dd className="inline">{e.sizeMb} MB</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-12 border-t border-line pt-8 max-w-[68ch] space-y-4 text-[14px] leading-[1.9]">
        <h2 className="ui-section-title">{en ? "How it works" : "購入の流れと使い道"}</h2>
        <p className="text-muted">
          {en ? (
            <>
              Each scene is scanned on location, not modelled by hand.
              <br />
              You can walk it in the browser first, then buy the data and download it as files.
              <br />
              What you may do with it is set by the license you choose.
            </>
          ) : (
            <>
              どのシーンも現地で撮影した実写の3Dスキャンで、手作業のCGモデルではありません。
              <br />
              購入前にブラウザで歩いて確認でき、購入後はファイルとしてダウンロードできます。
              <br />
              使える範囲は選んだライセンスで決まります。
            </>
          )}
        </p>
        <p className="text-muted">
          {en ? (
            <>
              Need a location that is not listed, or the data of a scene we do not sell yet?
              <br />
              <Link href={lh("/contact/license")} className="text-accent underline underline-offset-2">
                Ask us about data licensing
              </Link>
              .
            </>
          ) : (
            <>
              一覧に無いロケ地や、まだ販売していないシーンのデータが必要な場合は、
              <Link href={lh("/contact/license")} className="text-accent underline underline-offset-2">
                データ利用のご相談
              </Link>
              からお問い合わせください。
            </>
          )}
        </p>
        <p className="text-[13px] text-muted">
          {en ? (
            <>
              Terms:{" "}
              <Link href={lh("/terms/data-download")} className="text-accent underline underline-offset-2">
                3D Data Purchase Agreement
              </Link>
            </>
          ) : (
            <>
              購入条件は
              <Link href={lh("/terms/data-download")} className="text-accent underline underline-offset-2">
                3Dデータ購入規約
              </Link>
              のとおりです。
            </>
          )}
        </p>
      </section>
    </div>
  );
}

/** 検索エンジン向けの商品一覧（価格は表示と同じ値。無料は 0 として出す）。 */
function itemListJsonLd(entries: DataSaleEntry[], en: boolean) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: en ? "3D scan data for sale" : "3Dスキャンデータ販売",
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: en
          ? `3D scan data of ${e.propertyTitle} (${e.sceneLabel})`
          : `${e.propertyTitle}（${e.sceneLabel}）の3Dスキャンデータ`,
        category: en ? "3D model" : "3Dデータ",
        image: e.cover.src.startsWith("http") ? e.cover.src : `${SITE_URL}${e.cover.src}`,
        url: `${SITE_URL}${en ? "/en" : ""}${e.href}`,
        offers: {
          "@type": "Offer",
          price: e.price,
          priceCurrency: "JPY",
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}${en ? "/en" : ""}${e.href}`,
        },
      },
    })),
  };
}
