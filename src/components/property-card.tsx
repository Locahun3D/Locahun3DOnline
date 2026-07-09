import Link from "next/link";
import type { Property } from "@/lib/schemas";
import { categoryLabel, tokenCostLabel, isNewProperty } from "@/lib/schemas";
import { localizedHref, type Locale } from "@/lib/i18n/dictionaries";
import BookmarkButton from "@/components/bookmark-button";

export default function PropertyCard({
  property,
  locale = "ja",
  showBookmark = false,
  bookmarked = false,
  signedIn = false,
  revalidate,
}: {
  property: Property;
  locale?: Locale;
  /** ★ で保存解除できるオーバーレイを画像右下に出す（保存一覧など）。 */
  showBookmark?: boolean;
  bookmarked?: boolean;
  signedIn?: boolean;
  revalidate?: string;
}) {
  const en = locale === "en";
  const yen = property.hourlyPrice.toLocaleString(en ? "en-US" : "ja-JP");
  return (
    <Link
      href={localizedHref(`/properties/${property.id}`, locale)}
      className="group block border border-line bg-bg overflow-hidden hover:border-accent transition"
    >
      <div className="relative aspect-[16/10] bg-[#141414] overflow-hidden">
        {/* Using img instead of next/image to skip remote domain config for the mock data */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={property.cover.src}
          alt={property.cover.alt}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 pointer-events-none" />
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          {isNewProperty(property) && (
            <div className="mono text-[10px] tracking-[0.28em] uppercase bg-[#e8443a] text-white px-2 py-1 font-bold">
              New
            </div>
          )}
          <div className="mono text-[10px] tracking-[0.28em] uppercase bg-bg/70 backdrop-blur px-2 py-1 border border-line">
            {categoryLabel(property.category, locale)}
          </div>
        </div>
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
          <div className="mono text-[10px] tracking-[0.28em] uppercase bg-accent text-bg px-2 py-1">
            3DGS
          </div>
          <div
            className="mono text-[9px] tracking-[0.22em] uppercase bg-bg/85 backdrop-blur border border-line px-1.5 py-0.5"
            title={en ? `${property.tokenCost} token(s) — ${tokenCostLabel(property.tokenCost, "en")}` : `${property.tokenCost} トークン消費 — ${tokenCostLabel(property.tokenCost, "ja")}`}
          >
            {property.tokenCost}T
          </div>
        </div>
        <div className="absolute bottom-3 left-3 mono text-[10px] tracking-[0.24em] opacity-80">
          {property.id.toUpperCase()}
        </div>
        {showBookmark && (
          <div className="absolute bottom-3 right-3 z-[2]">
            <BookmarkButton
              propertyId={property.id}
              initialBookmarked={bookmarked}
              signedIn={signedIn}
              revalidate={revalidate}
              variant="overlay"
            />
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col gap-3">
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted">
          {property.prefecture} / {property.city}
        </div>
        <h3 className="serif text-[1.15rem] leading-[1.5] group-hover:text-accent transition">
          {property.title}
        </h3>
        <p className="text-[13px] leading-[1.7] text-muted line-clamp-2">
          {property.summary}
        </p>

        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] mono text-muted">
          <div>
            <div className="opacity-50 text-[9px] uppercase tracking-[0.22em]">{en ? "Ceiling" : "天井"}</div>
            <div className="text-ink">
              {property.category === "outdoor"
                ? en ? "Outdoor" : "屋外"
                : property.ceilingHeightM
                  ? `${property.ceilingHeightM}m`
                  : "—"}
            </div>
          </div>
          <div>
            <div className="opacity-50 text-[9px] uppercase tracking-[0.22em]">{en ? "Parking" : "駐車"}</div>
            <div className="text-ink">{property.parking ? (en ? "Yes" : "可") : "—"}</div>
          </div>
        </div>

        <div className="flex items-baseline justify-between pt-3 border-t border-line">
          <div>
            {property.priceType === "free" ? (
              <span className="serif text-2xl text-accent">{en ? "Free" : "無料"}</span>
            ) : property.priceType === "flat" ? (
              property.hourlyPrice > 0 ? (
                <div>
                  <span className="serif text-2xl text-accent">¥{yen}</span>
                  <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">
                    {en ? "(permit fee)" : "（撮影許可）"}
                  </span>
                </div>
              ) : (
                <span className="serif text-[15px] text-accent">
                  {en ? "Filming permit required" : `${property.permitType || "撮影許可"}の申請が必要です`}
                </span>
              )
            ) : property.hourlyPrice > 0 ? (
              <div>
                <span className="serif text-2xl text-accent">¥{yen}</span>
                <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">/hr</span>
              </div>
            ) : (
              <span className="serif text-[15px] text-accent">
                {en ? "Contact for pricing" : "お問い合わせください"}
              </span>
            )}
            {property.priceType === "hourly" && property.dailyPrice > 0 && (
              <div className="mono text-[10px] text-muted mt-0.5">
                Day: ¥{property.dailyPrice.toLocaleString("ja-JP")}
              </div>
            )}
          </div>
          <span className="mono text-[10px] tracking-[0.22em] uppercase opacity-60 group-hover:text-accent group-hover:opacity-100 transition">
            {en ? "View details →" : "詳細を見る →"}
          </span>
        </div>
      </div>
    </Link>
  );
}
