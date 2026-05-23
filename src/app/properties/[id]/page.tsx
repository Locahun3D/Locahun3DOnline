import { notFound } from "next/navigation";
import Link from "next/link";
import { getProperty, PROPERTIES, CATEGORY_LABEL } from "@/lib/properties";
import ImageGallery from "@/components/image-gallery";
import ViewerGate from "@/components/viewer-gate";

export function generateStaticParams() {
  return PROPERTIES.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = getProperty(id);
  if (!p) return { title: "Not found" };
  return {
    title: p.title,
    description: p.summary,
    openGraph: { images: [p.cover.src] },
  };
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = getProperty(id);
  if (!property) notFound();

  const yen = property.hourlyPrice.toLocaleString("ja-JP");

  return (
    <article className="frame pt-10 pb-24">
      <nav className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-6 flex gap-2 items-center">
        <Link href="/properties" className="hover:text-accent">CATALOG</Link>
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
          <h1 className="serif text-[clamp(1.8rem,3.8vw,3rem)] font-light leading-[1.3] mb-5">
            {property.title}
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
              <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">/hr</span>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-[12px]">
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">面積</dt>
            <dd className="text-right">{property.floorAreaSqm} ㎡</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">天井高</dt>
            <dd className="text-right">{property.ceilingHeightM || "—"} m</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">収容</dt>
            <dd className="text-right">{property.capacity} 名</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">自然光</dt>
            <dd className="text-right">{property.hasNaturalLight ? "あり" : "なし"}</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">駐車</dt>
            <dd className="text-right">{property.parking ? "可" : "不可"}</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">搬入口</dt>
            <dd className="text-right">{property.loadingDock ? "大" : "通常"}</dd>
            <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">スキャン</dt>
            <dd className="text-right">{property.scannedAt}</dd>
          </dl>

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

      {/* 3DGS Viewer (paywalled) */}
      <section className="mb-16">
        <div className="chapter-rule">
          <span className="opacity-60">3DGS</span>
          <span>Virtual Walkthrough</span>
          <span className="flex-1 h-px bg-current opacity-25" />
          <span className="opacity-60">{property.splatSizeMb} MB</span>
        </div>
        <ViewerGate splatUrl={property.splatUrl} propertyId={property.id} />
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

      {/* Related */}
      <section>
        <div className="chapter-rule">
          <span className="opacity-60">RELATED</span>
          <span>Other Locations</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PROPERTIES.filter((p) => p.id !== property.id)
            .slice(0, 3)
            .map((p) => (
              <Link
                key={p.id}
                href={`/properties/${p.id}`}
                className="group block border border-line overflow-hidden hover:border-accent transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.cover.src} alt={p.cover.alt} className="w-full aspect-[16/10] object-cover" />
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
    </article>
  );
}
