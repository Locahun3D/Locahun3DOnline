import Link from "next/link";
import type { DataSaleEntry } from "@/lib/data-catalog";
import { localizedHref } from "@/lib/i18n/dictionaries";
import TitleText from "@/components/title-text";

/**
 * ダウンロード直後に「ほかにダウンロードできる3Dデータ」を見せる（2026-10-13 本人指示）。
 *
 * なぜ要るか: 無料配布で来た人の 95% が1点だけ受け取って帰り、スタジオや他のデータを
 * 見ていなかった（2,164人中、2点目まで受け取ったのは102人）。受け取った直後が
 * いちばん次を見てくれる瞬間なので、そこに並べる。
 *
 * server component。entries は listDataSales() の結果、purchasedKeys は
 * `${propertyId}:${sceneIndex}` の集合（受け取り済みと今のシーンは除く）。
 */
export default function NextDownloads({
  entries,
  purchasedKeys,
  locale,
  limit = 6,
  heading,
}: {
  entries: DataSaleEntry[];
  purchasedKeys: Set<string>;
  locale: "ja" | "en";
  limit?: number;
  heading?: string;
}) {
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  const rest = entries.filter((e) => !purchasedKeys.has(`${e.propertyId}:${e.sceneIndex}`));
  if (rest.length === 0) return null;
  const shown = rest.slice(0, limit);
  const freeCount = rest.filter((e) => e.free).length;

  return (
    <section data-next-downloads aria-label={en ? "More 3D data" : "ほかの3Dデータ"} className="border border-line bg-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="serif text-lg sm:text-xl">
          {heading ?? (en ? "More 3D data you can download" : "ほかにもダウンロードできる3Dデータ")}
        </h2>
        <span className="mono text-[10px] tracking-[0.2em] uppercase text-muted">
          {en
            ? `${rest.length} available${freeCount ? ` · ${freeCount} free` : ""}`
            : `${rest.length}件${freeCount ? `・うち無料${freeCount}件` : ""}`}
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((e) => (
          <li key={`${e.propertyId}:${e.sceneIndex}`} className="min-w-0">
            <Link href={lh(e.href)} className="group flex gap-3 border border-line bg-bg p-2 transition hover:border-ink min-h-[44px]">
              <div className="relative w-24 shrink-0 aspect-[16/10] bg-[#141414] overflow-hidden">
                {e.cover.src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- next/image は使わない（CLAUDE.md）
                  <img src={e.cover.src} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : null}
                {e.free && (
                  <span className="absolute top-1 left-1 mono text-[9px] tracking-[0.2em] uppercase bg-[#e8443a] text-white px-1.5 py-0.5 font-bold">
                    {en ? "Free" : "無料"}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                <div className="text-[13px] leading-snug [overflow-wrap:anywhere] group-hover:text-accent transition">
                  <TitleText text={e.propertyTitle} />
                </div>
                <div className="flex items-baseline justify-between gap-2 mono text-[10px] text-muted">
                  <span className="truncate">{e.prefecture} / {e.city}</span>
                  <span className="shrink-0 text-accent">
                    {e.free ? (en ? "Free" : "無料") : en ? `From ¥${e.price.toLocaleString("en-US")}` : `¥${e.price.toLocaleString("ja-JP")}〜`}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="text-right">
        <Link href={lh("/data")} className="mono text-[10px] tracking-[0.22em] uppercase text-accent underline-offset-4 hover:underline inline-flex items-center min-h-[44px] sm:min-h-0">
          {en ? "See all 3D data →" : "3Dデータ一覧を見る →"}
        </Link>
      </div>
    </section>
  );
}
