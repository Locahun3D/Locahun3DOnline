import Link from "next/link";
import { getPublishedProperties } from "@/lib/properties";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { listDataSales, summarizeDataSales, type DataSaleEntry } from "@/lib/data-catalog";
import { categoryLabel, dataLicenseLabel } from "@/lib/schemas";
import TitleText from "@/components/title-text";

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
        /* カタログ（/properties）と同じカード・同じ並び（2026-09-26 本人指摘「トンマナあってない／物件サムネはこれにあわせて」）。 */
        <ul data-property-grid className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),320px))] max-[639px]:grid-cols-1 gap-5 min-[720px]:max-[1024px]:gap-3">
          {entries.map((e) => (
            <li key={`${e.propertyId}-${e.sceneId}`}>
              <DataSaleCard entry={e} en={en} href={lh(e.href)} locale={locale} />
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

/**
 * 販売シーンのカード。見た目はカタログの PropertyCardLite に合わせる
 * （16:10 の写真＋左上のカテゴリ、右上の 3DGS、下に所在地・名前・項目・価格）。
 */
function DataSaleCard({
  entry: e,
  en,
  href,
  locale,
}: {
  entry: DataSaleEntry;
  en: boolean;
  href: string;
  locale: "ja" | "en";
}) {
  const name = e.propertyTitle;
  // シーン名が物件名と同じ（1シーンだけの物件）なら出さない。
  const showScene = e.sceneLabel && !name.replace(/\s/g, "").startsWith(e.sceneLabel.replace(/\s/g, ""));
  return (
    <Link href={href} className="group flex flex-col h-full border border-line bg-bg overflow-hidden transition hover:border-ink">
      <div className="relative aspect-[16/10] bg-[#141414] overflow-hidden">
        {e.cover.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- next/image は使わない（CLAUDE.md）
          <img src={e.cover.src} alt={e.cover.alt} loading="lazy" className="w-full h-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 pointer-events-none" />
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {e.free && (
            <div className="mono text-[10px] tracking-[0.24em] uppercase bg-[#e8443a] text-white px-2 py-1 font-bold">
              {en ? "Free" : "無料"}
            </div>
          )}
          <div className="mono text-[10px] tracking-[0.24em] uppercase bg-bg/70 backdrop-blur px-2 py-1 border border-line">
            {categoryLabel(e.category, locale)}
          </div>
        </div>
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <div className="mono text-[10px] tracking-[0.24em] uppercase bg-accent text-bg px-2 py-1">3DGS</div>
          {e.formats.length > 0 && (
            <div className="mono text-[9px] tracking-[0.2em] uppercase bg-bg/85 backdrop-blur border border-line px-1.5 py-0.5">
              {e.formats.join(" · ")}
            </div>
          )}
        </div>
        {e.sizeMb > 0 && (
          <div className="absolute bottom-2 right-2 mono text-[10px] tracking-[0.2em] uppercase bg-bg/80 backdrop-blur px-2 py-1 border border-line">
            {e.sizeMb} MB
          </div>
        )}
      </div>
      <div className="p-4 gap-3 flex flex-col flex-1">
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted">
          {e.prefecture} / {e.city}
        </div>
        <h2 className="ui-card-title serif min-h-[3em] [overflow-wrap:anywhere] group-hover:text-accent transition">
          <TitleText text={name} />
        </h2>
        {showScene && <div className="mono text-[10px] tracking-[0.18em] text-muted -mt-1">{e.sceneLabel}</div>}
        <div className="grid grid-cols-2 gap-1.5 text-[10px] mono text-muted">
          <Stat label={en ? "License" : "ライセンス"} value={e.licenses.map((l) => dataLicenseLabel(l as never, locale)).join(" / ") || "—"} />
          <Stat label={en ? "Scan" : "撮影"} value={e.scannedAt ? e.scannedAt.slice(0, 10).replaceAll("-", ".") : "—"} />
        </div>
        <div className="flex items-baseline justify-between pt-2 border-t border-line mt-auto">
          {e.free ? (
            <span className="serif text-xl text-accent">{en ? "Free download" : "無料配布"}</span>
          ) : (
            <div>
              <span className="serif text-xl text-accent">¥{e.price.toLocaleString("ja-JP")}</span>
              <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">{en ? "incl. tax ~" : "税込〜"}</span>
            </div>
          )}
          <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-60">{en ? "Details →" : "詳細 →"}</span>
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-line pl-2 min-w-0">
      <div className="opacity-50 text-[9px] uppercase tracking-[0.2em]">{label}</div>
      <div className="text-ink truncate">{value}</div>
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
