import {
  getPublishedProperties,
  getAllAreas,
  CATEGORY_LABEL,
  filterProperties,
} from "@/lib/properties";
import type { PropertyCategory } from "@/lib/properties";
import PropertyCard from "@/components/property-card";
import PropertyFilters from "@/components/property-filters";

type SP = Record<string, string | string[] | undefined>;

function pick(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export const metadata = {
  title: "物件を探す",
  description:
    "スタジオ・倉庫・住宅・店舗・屋外ロケ地を 3D Gaussian Splatting 付きで横断検索。撮影前に空間ごと持ち帰れます。",
};

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const category =
    (pick(sp, "category") as PropertyCategory | "all" | undefined) ?? "all";
  const area = pick(sp, "area") ?? "all";
  const q = pick(sp, "q") ?? "";
  const maxPriceRaw = pick(sp, "maxPrice");
  const minCeilingRaw = pick(sp, "minCeiling");
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;
  const minCeiling = minCeilingRaw ? Number(minCeilingRaw) : undefined;

  const all = await getPublishedProperties();
  const areas = await getAllAreas();

  const filtered = filterProperties(all, {
    category,
    area,
    q,
    maxPrice,
    minCeiling,
  });

  return (
    <div className="frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">CATALOG</span>
        <span>Find a Location</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <span className="opacity-60">
          {filtered.length} / {all.length}
        </span>
      </div>

      <header className="mb-10">
        <h1 className="serif text-[clamp(2rem,4vw,3.4rem)] font-light leading-[1.3] mb-3">
          撮影現場を探す。
        </h1>
        <p className="text-[14px] text-muted max-w-[60ch] leading-[1.85]">
          条件で絞り込んで、サムネイルから 3DGS ビューアー付きの物件詳細へ。
          下見は <em className="not-italic text-accent">画面の中で</em>{" "}
          完結します。
        </p>
      </header>

      <PropertyFilters
        defaults={{ category, area, q, maxPrice, minCeiling }}
        areas={areas}
        categories={Object.keys(CATEGORY_LABEL) as PropertyCategory[]}
      />

      {filtered.length === 0 ? (
        <div className="mt-16 border border-line p-12 text-center">
          <div className="mono text-[12px] tracking-[0.3em] uppercase opacity-60 mb-3">
            No results
          </div>
          <p className="text-muted text-[14px]">
            条件に合致する物件が見つかりません。フィルターを緩めてください。
          </p>
        </div>
      ) : (
        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-7">
          {filtered.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}
    </div>
  );
}
