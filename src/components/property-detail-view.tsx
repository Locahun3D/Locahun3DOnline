import Link from "next/link";
import {
  CATEGORY_LABEL,
  TOKEN_COST_LABEL,
  PLAN_TOKEN_BUDGET,
  type Property,
} from "@/lib/schemas";
import ImageGallery from "@/components/image-gallery";
import ViewerGate from "@/components/viewer-gate";
import StudioPageBlocks from "@/components/studio/studio-page-blocks";

/**
 * Shared property detail body. Used by the public page (`/properties/[id]`,
 * published only) and the admin preview (`/admin/properties/[id]/preview`,
 * any status). Presentational only — pages fetch and pass the data, and the
 * public page additionally renders <TrackView/> (omitted here so previews
 * don't log analytics views).
 */
export default function PropertyDetailView({
  property,
  others,
  preview = false,
  freeAccess = false,
}: {
  property: Property;
  others: Property[];
  preview?: boolean;
  /** 限定無料期間: 全 3DGS をトークン消費なしで閲覧可能。 */
  freeAccess?: boolean;
}) {
  const yen = property.hourlyPrice.toLocaleString("ja-JP");

  return (
    <article className="theme-online frame pt-10 pb-24">
      {preview && (
        <div className="mb-6 border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-[12px] mono tracking-[0.08em] text-amber-300 flex flex-wrap items-center justify-between gap-3">
          <span>
            ● 管理プレビュー — ステータス:{" "}
            <strong className="uppercase">{property.status}</strong>
            （未公開でもこの画面で確認できます）
          </span>
          <Link
            href={`/admin/properties/${property.id}/edit`}
            className="underline hover:text-amber-200"
          >
            ← 編集に戻る
          </Link>
        </div>
      )}

      <nav className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-6 flex gap-2 items-center">
        <Link href="/properties" className="hover:text-accent">
          CATALOG
        </Link>
        <span>/</span>
        <span>{CATEGORY_LABEL[property.category]}</span>
        <span>/</span>
        <span className="text-ink/70">{property.id.toUpperCase()}</span>
      </nav>

      <header className="grid lg:grid-cols-3 gap-10 mb-12">
        <div className="lg:col-span-2">
          <div className="mono text-[11px] tracking-[0.3em] uppercase text-accent mb-3">
            {property.prefecture} {property.city}
          </div>
          <h1 className="serif text-[clamp(1.8rem,3.8vw,3rem)] font-bold leading-[1.3] mb-5">
            {property.title || "（無題の物件）"}
          </h1>
          <p className="text-[15px] leading-[1.9] text-muted whitespace-pre-line max-w-[70ch]">
            {property.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {property.tags.map((t) => (
              <span
                key={t}
                className="mono text-[10px] tracking-[0.2em] uppercase border border-line px-2 py-1 opacity-80"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <aside className="border border-line p-6 h-fit space-y-5">
          <div>
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50">
              貸出料金
            </div>
            <div className="mt-1">
              <span className="serif text-4xl text-accent">¥{yen}</span>
              <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">
                /hr
              </span>
            </div>
            {property.dailyPrice > 0 ? (
              <div className="mt-2 mono text-[12px]">
                日貸し:{" "}
                <span className="text-accent">
                  ¥{property.dailyPrice.toLocaleString("ja-JP")}
                </span>
                <span className="opacity-50 ml-1">/day</span>
              </div>
            ) : (
              <div className="mt-2 mono text-[10px] opacity-50">日貸し非対応</div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-[12px]">
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
              面積
            </dt>
            <dd className="text-right">{property.floorAreaSqm} ㎡</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
              天井高
            </dt>
            <dd className="text-right">{property.ceilingHeightM || "—"} m</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
              収容
            </dt>
            <dd className="text-right">{property.capacity} 名</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
              自然光
            </dt>
            <dd className="text-right">
              {property.hasNaturalLight ? "あり" : "なし"}
            </dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
              駐車
            </dt>
            <dd className="text-right">{property.parking ? "可" : "不可"}</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
              搬入口
            </dt>
            <dd className="text-right">{property.loadingDock ? "大" : "通常"}</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
              スキャン
            </dt>
            <dd className="text-right">{property.scannedAt || "—"}</dd>
          </dl>

          <div className="pt-4 border-t border-line">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-2">
              ● 3DGS 視聴コスト
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="serif text-2xl text-accent">
                {property.tokenCost}
              </span>
              <span className="mono text-[10px] tracking-[0.18em] opacity-50">
                トークン
              </span>
              <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-auto">
                {TOKEN_COST_LABEL[property.tokenCost]}
              </span>
            </div>
            <div className="text-[11px] text-muted mt-2 leading-[1.7]">
              {property.tokenCost === 1 ? (
                <>
                  Free 登録特典の 1 トークンで 1 件視聴可能。<br className="pc" />
                  Individual ({PLAN_TOKEN_BUDGET.individual}t/月) で月 8 件、 Studio
                  ({PLAN_TOKEN_BUDGET.studio}t/月) で月 12 件まで継続視聴。
                </>
              ) : (
                <>
                  Individual ({PLAN_TOKEN_BUDGET.individual}t/月) で月{" "}
                  {Math.floor(PLAN_TOKEN_BUDGET.individual / property.tokenCost)}{" "}
                  件、 Studio ({PLAN_TOKEN_BUDGET.studio}t/月) で月{" "}
                  {Math.floor(PLAN_TOKEN_BUDGET.studio / property.tokenCost)}{" "}
                  件まで視聴可能
                  <span className="block opacity-70 mt-0.5">
                    ※ Free の登録時 1 トークンではハウススタジオ (1t) のみ視聴可
                  </span>
                </>
              )}
            </div>
            <Link
              href="/pricing"
              className="mt-2 inline-block mono text-[10px] tracking-[0.22em] uppercase text-accent hover:underline"
            >
              プラン詳細 →
            </Link>
          </div>

          {/* Contact info */}
          {(property.contactPhone || property.contactEmail || property.contactWebsite) && (
            <div className="pt-4 border-t border-line space-y-2">
              <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-1">
                お問い合わせ
              </div>
              {property.contactPhone && (
                <a
                  href={`tel:${property.contactPhone}`}
                  className="flex items-center gap-2 text-[12px] hover:text-accent transition"
                >
                  <span className="opacity-50">TEL</span>
                  <span>{property.contactPhone}</span>
                </a>
              )}
              {property.contactEmail && (
                <a
                  href={`mailto:${property.contactEmail}`}
                  className="flex items-center gap-2 text-[12px] hover:text-accent transition"
                >
                  <span className="opacity-50">MAIL</span>
                  <span>{property.contactEmail}</span>
                </a>
              )}
              {property.contactWebsite && (
                <a
                  href={property.contactWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[12px] hover:text-accent transition"
                >
                  <span className="opacity-50">HP</span>
                  <span className="truncate">{property.contactWebsite.replace(/^https?:\/\//, "")}</span>
                  <span className="opacity-40">↗</span>
                </a>
              )}
            </div>
          )}

          {/* Blueprints download */}
          {property.blueprints && property.blueprints.length > 0 && property.blueprints.some(b => b.url) && (
            <div className="pt-4 border-t border-line space-y-2">
              <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-1">
                図面 / フロアプラン
              </div>
              {property.blueprints.filter(b => b.url).map((b, i) => (
                <a
                  key={i}
                  href={b.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[12px] border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
                >
                  <span className="mono text-[10px] opacity-50">■</span>
                  <span className="flex-1 truncate">{b.label || `図面 ${i + 1}`}</span>
                  <span className="mono text-[10px] tracking-[0.22em] uppercase opacity-60">DL</span>
                </a>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-line space-y-2">
            <button
              type="button"
              className="w-full px-4 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
            >
              見積もり依頼
            </button>
            <Link
              href="/pricing"
              className="block text-center w-full px-4 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-line hover:border-ink transition"
            >
              閲覧プランを見る
            </Link>
          </div>
        </aside>
      </header>

      {property.pageBlocks && property.pageBlocks.length > 0 ? (
        /* Custom page composed in the studio page builder */
        <section className="mb-16">
          <StudioPageBlocks blocks={property.pageBlocks} property={property} freeAccess={freeAccess} />
        </section>
      ) : (
        <>
          {/* 3DGS Viewer (paywalled) */}
          <section className="mb-16">
            <div className="chapter-rule">
              <span className="opacity-60">3DGS</span>
              <span>Virtual Walkthrough</span>
              <span className="flex-1 h-px bg-current opacity-25" />
              <span className="opacity-60">{property.splatSizeMb} MB</span>
            </div>
            <ViewerGate
              splatUrl={property.splatUrl}
              propertyId={property.id}
              tokenCost={property.tokenCost}
              freeAccess={freeAccess}
              splatItems={property.splatItems}
            />
          </section>

          {/* Image Gallery */}
          <section className="mb-16">
            <div className="chapter-rule">
              <span className="opacity-60">STILLS</span>
              <span>Reference Photos</span>
              <span className="flex-1 h-px bg-current opacity-25" />
              <span className="opacity-60">{property.gallery.length} 枚</span>
            </div>
            <ImageGallery images={[property.cover, ...property.gallery]} />
          </section>
        </>
      )}

      {/* Related */}
      {others.length > 0 && (
        <section>
          <div className="chapter-rule">
            <span className="opacity-60">RELATED</span>
            <span>Other Locations</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {others.map((p) => (
              <Link
                key={p.id}
                href={`/properties/${p.id}`}
                className="group block border border-line overflow-hidden hover:border-accent transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.cover.src}
                  alt={p.cover.alt}
                  className="w-full aspect-[16/10] object-cover"
                />
                <div className="p-4">
                  <div className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
                    {p.city}
                  </div>
                  <div className="serif text-base mt-1 group-hover:text-accent transition">
                    {p.title}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
