"use client";

import Link from "next/link";
import { categoryLabel, tokenCostLabel, isNewProperty, type Property } from "@/lib/schemas";
import { formatKm } from "@/lib/distance";
import BookmarkButton from "@/components/bookmark-button";
import { useLocale } from "@/components/locale-provider";

/**
 * 物件カード（カタログ /properties の一覧と同じ見た目）。
 *
 * 2026-09-26 本人指示「類似スタジオ、この並びになるようにして」で、物件ページ末尾の
 * 類似スタジオもこのカードで並べることにした。以前は catalog-client.tsx の中の
 * ローカル関数だったので、同じ見た目を2か所で持たないよう部品として切り出した。
 * ⚠ 中身は切り出し前と1文字も変えていない（カタログの見た目は不変）。
 *   変わったのは export と、★の再検証パスを引数にしたことだけ。
 */

export default function PropertyCardLite({
  property, distanceKm, referenceLabel, highlighted = false, bookmarked = false, signedIn = false,
  revalidate = "/properties",
}: {
  property: Property; distanceKm: number | null;
  referenceLabel: string; highlighted?: boolean;
  bookmarked?: boolean; signedIn?: boolean;
  /** ★ を押したあとに再検証するパス（置き場所ごとに違う）。 */
  revalidate?: string;
}) {
  const en = useLocale() === "en";
  const lc = en ? "en" : "ja";
  const yen = property.hourlyPrice.toLocaleString(en ? "en-US" : "ja-JP");
  // 3Dデータの有無（property-card.tsx と同一判定）。写真のみ掲載枠があるため、
  // バッジは実際に3Dがある物件にだけ出す。
  const hasSplat =
    !!property.splatUrl?.trim() ||
    (property.splatItems ?? []).some((s) => !!s.splatUrl?.trim());
  return (
    <Link
      href={en ? `/en/properties/${property.id}` : `/properties/${property.id}`}
      className={`flex flex-col h-full border bg-bg overflow-hidden transition ${
        highlighted ? "border-accent" : "border-line hover:border-ink"
      }`}
    >
      <div className="relative aspect-[16/10] bg-[#141414] overflow-hidden">
        {property.cover.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={property.cover.src} alt={property.cover.alt} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center mono text-[10px] opacity-40">no cover</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 pointer-events-none" />
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {isNewProperty(property) && (
            <div className="mono text-[10px] tracking-[0.24em] uppercase bg-[#e8443a] text-white px-2 py-1 font-bold">
              New
            </div>
          )}
          <div className="mono text-[10px] tracking-[0.24em] uppercase bg-bg/70 backdrop-blur px-2 py-1 border border-line">
            {categoryLabel(property.category, lc)}
            {/* EN変換でカテゴリと同語になる場合（Warehouse · Warehouse）は重複表示しない */}
            {property.studioType && property.studioType.toLowerCase() !== categoryLabel(property.category, lc).toLowerCase()
              ? ` · ${property.studioType}`
              : ""}
          </div>
        </div>
        {hasSplat ? (
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
            <div className="mono text-[10px] tracking-[0.24em] uppercase bg-accent text-bg px-2 py-1">3DGS</div>
            <div
              className="mono text-[9px] tracking-[0.2em] uppercase bg-bg/85 backdrop-blur border border-line px-1.5 py-0.5"
              title={
                en
                  ? `${property.tokenCost} token(s) per view — ${tokenCostLabel(property.tokenCost, "en")}`
                  : `1 回視聴で ${property.tokenCost} トークン消費 — ${tokenCostLabel(property.tokenCost, "ja")}`
              }
            >
              {property.tokenCost}T ·{" "}
              {en
                ? property.tokenCost === 1 ? "House" : property.tokenCost === 2 ? "Mid" : "Large"
                : property.tokenCost === 1 ? "ハウス" : property.tokenCost === 2 ? "中規模" : "大規模"}
            </div>
          </div>
        ) : (
          /* 写真のみ掲載。3Dを探している利用者が一覧で判別できるよう明示する
             （バッジを単に消すと「まだ読み込み中」と誤解されるため）。 */
          <div className="absolute top-2 right-2 mono text-[10px] tracking-[0.24em] uppercase bg-bg/70 backdrop-blur px-2 py-1 border border-line text-muted">
            {en ? "Photos" : "写真のみ"}
          </div>
        )}
        {distanceKm !== null && (
          <div className="absolute bottom-2 right-2 mono text-[10px] tracking-[0.2em] uppercase bg-bg/80 backdrop-blur px-2 py-1 border border-line">
            {en ? `${formatKm(distanceKm)} from ${referenceLabel}` : `${referenceLabel} から ${formatKm(distanceKm)}`}
          </div>
        )}
        <div className="absolute bottom-2 left-2">
          <BookmarkButton
            propertyId={property.id}
            initialBookmarked={bookmarked}
            signedIn={signedIn}
            revalidate={revalidate}
            variant="overlay"
          />
        </div>
      </div>

      <div className="p-4 gap-3 flex flex-col flex-1">
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted">
          {property.prefecture} / {property.city}
        </div>
        <h3 className="ui-card-title serif min-h-[3em] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {property.title}
        </h3>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] mono text-muted">
          <Stat label={en ? "Ceiling" : "天井"} value={property.category === "outdoor" ? (en ? "Outdoor" : "屋外") : property.ceilingHeightM ? `${property.ceilingHeightM}m` : "—"} />
          <Stat label={en ? "Park" : "駐車"} value={property.parking ? (en ? "Yes" : "可") : "—"} accent={property.parking} />
        </div>
        {property.powerVoltage && (
          <div className="mono text-[10px] text-muted truncate">⚡ {property.powerVoltage}</div>
        )}
        <div className="flex items-baseline justify-between pt-2 border-t border-line mt-auto">
          {property.priceType === "free" ? (
            <span className="serif text-xl text-accent">{en ? "Free" : "無料"}</span>
          ) : property.priceType === "flat" ? (
            property.hourlyPrice > 0 ? (
              <div>
                <span className="serif text-xl text-accent">¥{yen}</span>
                <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">
                  {en ? "(permit fee)" : "（撮影許可）"}
                </span>
              </div>
            ) : (
              <span className="serif text-[13px] text-accent">
                {en
                  ? "Filming permit required"
                  : `${property.permitType || "撮影許可"}の申請が必要です`}
              </span>
            )
          ) : property.hourlyPrice > 0 ? (
            <div>
              <span className="serif text-xl text-accent">¥{yen}</span>
              <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">/hr</span>
            </div>
          ) : (
            <span className="serif text-[13px] text-accent">
              {en ? "Contact for pricing" : "お問い合わせください"}
            </span>
          )}
          <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-60">{en ? "Details →" : "詳細 →"}</span>
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-l border-line pl-2">
      <div className="opacity-50 text-[9px] uppercase tracking-[0.2em]">{label}</div>
      <div className={accent ? "text-accent" : "text-ink"}>{value}</div>
    </div>
  );
}
