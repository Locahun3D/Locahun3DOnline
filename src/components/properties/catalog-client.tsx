"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  CATEGORY_LABEL,
  REFERENCE_PRESETS,
  TOKEN_COST_LABEL,
  type Property,
  type PropertyCategory,
} from "@/lib/schemas";
import { formatKm, haversineKm } from "@/lib/distance";

const CatalogMap = dynamic(() => import("./catalog-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full border border-line bg-[#222] flex items-center justify-center">
      <span className="mono text-[10px] tracking-[0.3em] uppercase opacity-50 animate-pulse">
        Loading map…
      </span>
    </div>
  ),
});

// ── Range option presets (anchored to real industry distribution) ───────────
// Values chosen to bracket the seed data (current 6 properties: ¥8k-¥32k/hr,
// 12-80 capacity, 95-1500 sqm, 2.6-7.2 m ceiling) while leaving headroom up
// to 100+ properties of future variety (white cyc walls / outdoor / mansion).
const PRICE_HR_OPTS  = [5000, 10000, 15000, 20000, 30000, 50000, 100000];
const PRICE_DAY_OPTS = [30000, 50000, 100000, 200000, 300000, 500000, 1000000];
const CAPACITY_OPTS  = [5, 10, 20, 30, 50, 100, 200, 500];
const AREA_OPTS      = [30, 50, 100, 200, 500, 1000, 2000];
const CEILING_OPTS   = [2.0, 2.5, 3.0, 4.0, 5.0, 7.0, 10.0];
const DISTANCE_OPTS  = [5, 10, 30, 50, 100, 200, 500];

interface Props {
  items: Property[];
  areas: string[];
  studioTypes: string[];
}

type SortKey =
  | "newest" | "oldest"
  | "priceAsc" | "priceDesc"
  | "dailyAsc" | "dailyDesc"
  | "ceilingDesc" | "ceilingAsc"
  | "areaDesc" | "areaAsc"
  | "capacityDesc" | "capacityAsc"
  | "distanceAsc" | "distanceDesc";

interface Reference {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

const DEFAULT_REF: Reference = {
  id: "shibuya",
  lat: REFERENCE_PRESETS[0].lat,
  lng: REFERENCE_PRESETS[0].lng,
  label: REFERENCE_PRESETS[0].label,
};

export default function CatalogClient({ items, areas, studioTypes }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [reference, setReference] = useState<Reference>(DEFAULT_REF);

  // Filters (dual ranges where it makes sense)
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<PropertyCategory | "all">("all");
  const [area, setArea] = useState<string>("all");
  const [studioType, setStudioType] = useState<string>("all");
  const [minPrice, setMinPrice] = useState<number | "">("");
  const [maxPrice, setMaxPrice] = useState<number | "">("");
  const [minDailyPrice, setMinDailyPrice] = useState<number | "">("");
  const [maxDailyPrice, setMaxDailyPrice] = useState<number | "">("");
  const [minCapacity, setMinCapacity] = useState<number | "">("");
  const [maxCapacity, setMaxCapacity] = useState<number | "">("");
  const [minArea, setMinArea] = useState<number | "">("");
  const [maxArea, setMaxArea] = useState<number | "">("");
  const [minCeiling, setMinCeiling] = useState<number | "">("");
  const [maxCeiling, setMaxCeiling] = useState<number | "">("");
  const [maxKmFromRef, setMaxKmFromRef] = useState<number | "">("");
  const [maxToken, setMaxToken] = useState<1 | 2 | 3 | "all">("all");
  const [requiresDaily, setRequiresDaily] = useState(false);
  const [requiresParking, setRequiresParking] = useState(false);
  const [requires200V, setRequires200V] = useState(false);

  // Sort
  const [sort, setSort] = useState<SortKey>("newest");

  const reset = useCallback(() => {
    setQ("");
    setCategory("all"); setArea("all"); setStudioType("all");
    setMinPrice(""); setMaxPrice("");
    setMinDailyPrice(""); setMaxDailyPrice("");
    setMinCapacity(""); setMaxCapacity("");
    setMinArea(""); setMaxArea("");
    setMinCeiling(""); setMaxCeiling("");
    setMaxKmFromRef(""); setMaxToken("all");
    setRequiresDaily(false); setRequiresParking(false); setRequires200V(false);
    setSort("newest");
  }, []);

  // Validation: invalid ranges (min > max) are silently treated as unset for that pair
  const rangeOk = (lo: number | "", hi: number | "") =>
    !(typeof lo === "number" && typeof hi === "number" && lo > hi);

  // Compute distance + filtered + sorted
  const computed = useMemo(() => {
    const withDist = items.map((p) => ({
      ...p,
      distanceKm: p.coords ? haversineKm(reference, p.coords) : null,
    }));

    const filtered = withDist.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (area !== "all" && !p.area.toLowerCase().includes(area.toLowerCase())) return false;
      if (studioType !== "all" && !p.studioType.toLowerCase().includes(studioType.toLowerCase())) return false;

      if (rangeOk(minPrice, maxPrice)) {
        if (typeof minPrice === "number" && p.hourlyPrice < minPrice) return false;
        if (typeof maxPrice === "number" && p.hourlyPrice > maxPrice) return false;
      }
      if (rangeOk(minDailyPrice, maxDailyPrice)) {
        // dailyPrice 0 means "not offered"; treat as out-of-range only if max filter active
        if (typeof minDailyPrice === "number" && (p.dailyPrice ?? 0) < minDailyPrice) return false;
        if (typeof maxDailyPrice === "number" && ((p.dailyPrice ?? 0) === 0 || (p.dailyPrice ?? 0) > maxDailyPrice)) return false;
      }
      if (rangeOk(minCapacity, maxCapacity)) {
        if (typeof minCapacity === "number" && p.capacity < minCapacity) return false;
        if (typeof maxCapacity === "number" && p.capacity > maxCapacity) return false;
      }
      if (rangeOk(minArea, maxArea)) {
        if (typeof minArea === "number" && p.floorAreaSqm < minArea) return false;
        if (typeof maxArea === "number" && p.floorAreaSqm > maxArea) return false;
      }
      if (rangeOk(minCeiling, maxCeiling)) {
        if (typeof minCeiling === "number" && p.ceilingHeightM < minCeiling) return false;
        if (typeof maxCeiling === "number" && p.ceilingHeightM > maxCeiling) return false;
      }
      if (typeof maxKmFromRef === "number" &&
          (p.distanceKm === null || p.distanceKm > maxKmFromRef)) return false;
      if (maxToken !== "all" && p.tokenCost > maxToken) return false;
      if (requiresDaily && (!p.dailyPrice || p.dailyPrice <= 0)) return false;
      if (requiresParking && !p.parking) return false;
      if (requires200V && !/200\s*V/i.test(p.powerVoltage)) return false;
      if (q.trim()) {
        const h = `${p.title} ${p.summary} ${p.city} ${p.studioType} ${p.tags.join(" ")}`.toLowerCase();
        if (!h.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case "oldest":        return (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "");
        case "priceAsc":      return a.hourlyPrice - b.hourlyPrice;
        case "priceDesc":     return b.hourlyPrice - a.hourlyPrice;
        case "dailyAsc":      return (a.dailyPrice || Infinity) - (b.dailyPrice || Infinity);
        case "dailyDesc":     return (b.dailyPrice || 0) - (a.dailyPrice || 0);
        case "ceilingDesc":   return b.ceilingHeightM - a.ceilingHeightM;
        case "ceilingAsc":    return a.ceilingHeightM - b.ceilingHeightM;
        case "areaDesc":      return b.floorAreaSqm - a.floorAreaSqm;
        case "areaAsc":       return a.floorAreaSqm - b.floorAreaSqm;
        case "capacityDesc":  return b.capacity - a.capacity;
        case "capacityAsc":   return a.capacity - b.capacity;
        case "distanceAsc":   return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
        case "distanceDesc":  return (b.distanceKm ?? -1) - (a.distanceKm ?? -1);
        case "newest":
        default:              return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      }
    });

    return filtered;
  }, [
    items, reference,
    category, area, studioType,
    minPrice, maxPrice, minDailyPrice, maxDailyPrice,
    minCapacity, maxCapacity, minArea, maxArea, minCeiling, maxCeiling,
    maxKmFromRef, maxToken,
    requiresDaily, requiresParking, requires200V,
    q, sort,
  ]);

  const useGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      alert("お使いのブラウザはジオロケーションに対応していません。");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setReference({
        id: "current", lat: pos.coords.latitude, lng: pos.coords.longitude, label: "現在地",
      }),
      (err) => alert(`現在地を取得できませんでした: ${err.message}`),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);

  return (
    <div className="frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">CATALOG</span>
        <span>Find a Location</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-8">
        <h1 className="serif text-[clamp(2rem,4vw,3.4rem)] font-light leading-[1.3] mb-3">
          撮影現場を探す。
        </h1>
        <p className="text-[14px] text-muted max-w-[60ch] leading-[1.85]">
          地図と一覧を行き来して、レンズ・天井・搬入・距離まで撮影前に詰める。
          カードにカーソルを合わせると地図上にハイライトされます。
        </p>
      </header>

      <FiltersPanel
        q={q} setQ={setQ}
        category={category} setCategory={setCategory}
        area={area} setArea={setArea} areas={areas}
        studioType={studioType} setStudioType={setStudioType} studioTypes={studioTypes}
        reference={reference} setReference={setReference} useGeolocation={useGeolocation}
        minPrice={minPrice} setMinPrice={setMinPrice}
        maxPrice={maxPrice} setMaxPrice={setMaxPrice}
        minDailyPrice={minDailyPrice} setMinDailyPrice={setMinDailyPrice}
        maxDailyPrice={maxDailyPrice} setMaxDailyPrice={setMaxDailyPrice}
        minCapacity={minCapacity} setMinCapacity={setMinCapacity}
        maxCapacity={maxCapacity} setMaxCapacity={setMaxCapacity}
        minArea={minArea} setMinArea={setMinArea}
        maxArea={maxArea} setMaxArea={setMaxArea}
        minCeiling={minCeiling} setMinCeiling={setMinCeiling}
        maxCeiling={maxCeiling} setMaxCeiling={setMaxCeiling}
        maxKmFromRef={maxKmFromRef} setMaxKmFromRef={setMaxKmFromRef}
        maxToken={maxToken} setMaxToken={setMaxToken}
        requiresDaily={requiresDaily} setRequiresDaily={setRequiresDaily}
        requiresParking={requiresParking} setRequiresParking={setRequiresParking}
        requires200V={requires200V} setRequires200V={setRequires200V}
        reset={reset}
        resultCount={computed.length} totalCount={items.length}
      />

      <SortBar sort={sort} setSort={setSort} resultCount={computed.length} totalCount={items.length} />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_minmax(380px,_520px)] gap-6">
        <div>
          {computed.length === 0 ? (
            <div className="border border-line p-12 text-center">
              <div className="mono text-[12px] tracking-[0.3em] uppercase opacity-60 mb-3">
                No results
              </div>
              <p className="text-muted text-[14px]">
                条件に合致する物件が見つかりません。フィルタを緩めてください。
              </p>
            </div>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-5">
              {computed.map((p) => (
                <li
                  key={p.id}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition ${hoveredId === p.id ? "outline outline-1 outline-accent" : ""}`}
                >
                  <PropertyCardLite
                    property={p}
                    distanceKm={p.distanceKm}
                    referenceLabel={reference.label}
                    highlighted={hoveredId === p.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:sticky lg:top-20 self-start h-[60vh] lg:h-[calc(100vh-7rem)]">
          <CatalogMap
            items={computed}
            hoveredId={hoveredId}
            reference={reference}
            onMarkerHover={(id) => setHoveredId(id)}
          />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// FiltersPanel — Carsensor-style inline form
// ──────────────────────────────────────────────────────────────────────────

interface FiltersProps {
  q: string; setQ: (v: string) => void;
  category: PropertyCategory | "all"; setCategory: (v: PropertyCategory | "all") => void;
  area: string; setArea: (v: string) => void; areas: string[];
  studioType: string; setStudioType: (v: string) => void; studioTypes: string[];
  reference: Reference; setReference: (v: Reference) => void; useGeolocation: () => void;
  minPrice: number | ""; setMinPrice: (v: number | "") => void;
  maxPrice: number | ""; setMaxPrice: (v: number | "") => void;
  minDailyPrice: number | ""; setMinDailyPrice: (v: number | "") => void;
  maxDailyPrice: number | ""; setMaxDailyPrice: (v: number | "") => void;
  minCapacity: number | ""; setMinCapacity: (v: number | "") => void;
  maxCapacity: number | ""; setMaxCapacity: (v: number | "") => void;
  minArea: number | ""; setMinArea: (v: number | "") => void;
  maxArea: number | ""; setMaxArea: (v: number | "") => void;
  minCeiling: number | ""; setMinCeiling: (v: number | "") => void;
  maxCeiling: number | ""; setMaxCeiling: (v: number | "") => void;
  maxKmFromRef: number | ""; setMaxKmFromRef: (v: number | "") => void;
  maxToken: 1 | 2 | 3 | "all"; setMaxToken: (v: 1 | 2 | 3 | "all") => void;
  requiresDaily: boolean; setRequiresDaily: (v: boolean) => void;
  requiresParking: boolean; setRequiresParking: (v: boolean) => void;
  requires200V: boolean; setRequires200V: (v: boolean) => void;
  reset: () => void;
  resultCount: number; totalCount: number;
}

function FiltersPanel(p: FiltersProps) {
  const yenFmt = (n: number) =>
    n >= 10000
      ? `¥${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万`
      : `¥${n.toLocaleString("ja-JP")}`;

  return (
    <div className="border border-line bg-[#222] p-5 space-y-4">
      {/* Keyword search — full width */}
      <Row label="キーワード">
        <input
          type="search"
          value={p.q}
          onChange={(e) => p.setQ(e.target.value)}
          placeholder="白ホリ / 渋谷 / ガレージ / 倉庫 ..."
          className={inputCls + " w-full"}
        />
      </Row>

      <Divider />

      {/* Reference + Distance */}
      <Row label="参照地点 / 距離">
        <div className="grid md:grid-cols-[2fr_1fr] gap-3">
          <ReferencePicker
            value={p.reference}
            onChange={p.setReference}
            onUseGeolocation={p.useGeolocation}
          />
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] tracking-[0.22em] uppercase opacity-60">
              から
            </span>
            <ChoiceSelect
              value={p.maxKmFromRef}
              onChange={p.setMaxKmFromRef}
              options={DISTANCE_OPTS}
              format={(v) => `${v}km`}
              emptyLabel="制限なし"
              className="flex-1"
            />
            <span className="mono text-[10px] tracking-[0.22em] uppercase opacity-60">
              以内
            </span>
          </div>
        </div>
      </Row>

      <Divider />

      {/* Categorical: category, studioType, area */}
      <Row label="種別 / エリア">
        <div className="grid md:grid-cols-3 gap-3">
          <ChoiceSelect
            value={p.category}
            onChange={(v) => p.setCategory(v as PropertyCategory | "all")}
            options={Object.keys(CATEGORY_LABEL) as PropertyCategory[]}
            format={(v) => CATEGORY_LABEL[v as PropertyCategory]}
            emptyLabel="カテゴリ すべて"
          />
          <ComboPicker
            value={p.studioType}
            onChange={p.setStudioType}
            options={p.studioTypes}
            placeholder="スタジオ種類 (打ち込みも可)"
          />
          <ComboPicker
            value={p.area}
            onChange={p.setArea}
            options={p.areas}
            placeholder="エリア (打ち込みも可)"
          />
        </div>
      </Row>

      <Divider />

      {/* Range filters */}
      <div className="space-y-3">
        <RangeRow
          label="時間料金 (¥/hr)"
          min={p.minPrice} max={p.maxPrice}
          setMin={p.setMinPrice} setMax={p.setMaxPrice}
          options={PRICE_HR_OPTS} format={yenFmt}
        />
        <RangeRow
          label="日料金 (¥/day)"
          min={p.minDailyPrice} max={p.maxDailyPrice}
          setMin={p.setMinDailyPrice} setMax={p.setMaxDailyPrice}
          options={PRICE_DAY_OPTS} format={yenFmt}
        />
        <RangeRow
          label="収容人数 (名)"
          min={p.minCapacity} max={p.maxCapacity}
          setMin={p.setMinCapacity} setMax={p.setMaxCapacity}
          options={CAPACITY_OPTS} format={(v) => `${v}名`}
        />
        <RangeRow
          label="床面積 (㎡)"
          min={p.minArea} max={p.maxArea}
          setMin={p.setMinArea} setMax={p.setMaxArea}
          options={AREA_OPTS} format={(v) => `${v}㎡`}
        />
        <RangeRow
          label="天井高 (m)"
          min={p.minCeiling} max={p.maxCeiling}
          setMin={p.setMinCeiling} setMax={p.setMaxCeiling}
          options={CEILING_OPTS} format={(v) => `${v}m`}
        />
        <RangeRow
          label="トークン上限"
          min=""  // unused
          max={p.maxToken === "all" ? "" : p.maxToken}
          setMin={() => {}}
          setMax={(v) => p.setMaxToken(v === "" ? "all" : (v as 1 | 2 | 3))}
          options={[1, 2, 3]}
          format={(v) => `${v}t (${TOKEN_COST_LABEL[v as 1 | 2 | 3]})`}
          singleMax
        />
      </div>

      <Divider />

      {/* Toggles + reset */}
      <Row label="追加条件">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChip label="日料金あり" value={p.requiresDaily} onChange={p.setRequiresDaily} />
          <ToggleChip label="駐車場あり" value={p.requiresParking} onChange={p.setRequiresParking} />
          <ToggleChip label="200V 電源" value={p.requires200V} onChange={p.setRequires200V} />
          <button
            type="button"
            onClick={p.reset}
            className="ml-auto mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-ink transition"
          >
            ✕ すべてリセット
          </button>
        </div>
      </Row>
    </div>
  );
}

const inputCls =
  "bg-bg border border-line px-3 py-2 text-[13px] mono focus:outline-none focus:border-accent transition";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid md:grid-cols-[140px_1fr] gap-3 items-start">
      <div className="mono text-[10px] tracking-[0.26em] uppercase opacity-60 pt-2.5">
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-line" />;
}

function ToggleChip({
  label, value, onChange,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`px-3 py-1.5 mono text-[11px] tracking-[0.18em] uppercase border transition ${
        value
          ? "border-accent text-accent bg-[#2a1f10]"
          : "border-line text-muted hover:border-ink hover:text-ink"
      }`}
    >
      {value ? "✓ " : ""}{label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// RangeRow — dual dropdown for min - max
// ──────────────────────────────────────────────────────────────────────────

interface RangeRowProps {
  label: string;
  min: number | ""; max: number | "";
  setMin: (v: number | "") => void; setMax: (v: number | "") => void;
  options: number[];
  format: (v: number) => string;
  singleMax?: boolean;
}

function RangeRow({ label, min, max, setMin, setMax, options, format, singleMax }: RangeRowProps) {
  const invalid =
    typeof min === "number" && typeof max === "number" && min > max;

  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        {!singleMax && (
          <>
            <ChoiceSelect
              value={min}
              onChange={setMin}
              options={options}
              format={format}
              emptyLabel="下限なし"
              className={`flex-1 ${invalid ? "border-accent text-accent" : ""}`}
            />
            <span className="mono text-[12px] opacity-50">〜</span>
          </>
        )}
        <ChoiceSelect
          value={max}
          onChange={setMax}
          options={options}
          format={format}
          emptyLabel={singleMax ? "制限なし" : "上限なし"}
          className={`flex-1 ${invalid ? "border-accent text-accent" : ""}`}
        />
      </div>
      {invalid && (
        <div className="mono text-[10px] text-accent mt-1">
          ※ 下限 &gt; 上限 — このフィルタは無効化されています
        </div>
      )}
    </Row>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ChoiceSelect — native select with empty option
// ──────────────────────────────────────────────────────────────────────────

interface ChoiceSelectProps<T extends string | number> {
  value: T | "";
  onChange: (v: T | "") => void;
  options: readonly T[];
  format?: (v: T) => string;
  emptyLabel: string;
  className?: string;
}

function ChoiceSelect<T extends string | number>({
  value, onChange, options, format, emptyLabel, className = "",
}: ChoiceSelectProps<T>) {
  return (
    <select
      value={value === "" ? "" : String(value)}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") onChange("");
        else if (typeof options[0] === "number") onChange(Number(v) as T);
        else onChange(v as T);
      }}
      className={`${inputCls} cursor-pointer ${className}`}
    >
      <option value="" className="bg-bg">{emptyLabel}</option>
      {options.map((o) => (
        <option key={String(o)} value={String(o)} className="bg-bg">
          {format ? format(o) : String(o)}
        </option>
      ))}
    </select>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ComboPicker — text input + datalist (substring match in filter logic)
// ──────────────────────────────────────────────────────────────────────────

let comboId = 0;
function ComboPicker({
  value, onChange, options, placeholder,
}: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  const idRef = useRef<string>("");
  if (!idRef.current) idRef.current = `combo-${++comboId}`;
  const displayValue = value === "all" ? "" : value;
  return (
    <>
      <input
        type="text"
        list={idRef.current}
        value={displayValue}
        onChange={(e) => onChange(e.target.value.trim() === "" ? "all" : e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} w-full`}
      />
      <datalist id={idRef.current}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ReferencePicker — preserved from earlier version
// ──────────────────────────────────────────────────────────────────────────

interface GeocodeHit { display_name: string; lat: string; lon: string; }

function ReferencePicker({
  value, onChange, onUseGeolocation,
}: {
  value: Reference; onChange: (v: Reference) => void; onUseGeolocation: () => void;
}) {
  const [query, setQuery] = useState(value.label);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const lastReq = useRef(0);

  useEffect(() => { setQuery(value.label); }, [value.label]);

  useEffect(() => {
    const t = query.trim();
    setError(null);
    if (t === value.label || t.length < 2 || /(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/.test(t)) {
      setResults([]); return;
    }
    const id = ++lastReq.current;
    const timer = setTimeout(async () => {
      setResolving(true);
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(t)}`,
          { headers: { Accept: "application/json" } },
        );
        const j: GeocodeHit[] = await r.json();
        if (id === lastReq.current) setResults(j);
      } catch {
        if (id === lastReq.current) setError("検索に失敗");
      } finally {
        if (id === lastReq.current) setResolving(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, value.label]);

  const commit = useCallback((next: Reference) => {
    onChange(next); setQuery(next.label); setOpen(false); setResults([]);
  }, [onChange]);

  const tryResolve = useCallback(() => {
    const t = query.trim();
    if (!t) return;
    const preset = REFERENCE_PRESETS.find((r) => r.label === t || r.id === t);
    if (preset) {
      commit({ id: preset.id, lat: preset.lat, lng: preset.lng, label: preset.label });
      return;
    }
    const m = t.match(/(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/);
    if (m) {
      commit({ id: "custom", lat: parseFloat(m[1]), lng: parseFloat(m[2]), label: t });
      return;
    }
    if (results.length > 0) {
      const r = results[0];
      commit({ id: "geocoded", lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: t });
    }
  }, [query, results, commit]);

  return (
    <div className="relative">
      <div className="flex gap-1">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); tryResolve(); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="渋谷駅 / 大阪駅 / 35.66, 139.70 / ..."
          className={`${inputCls} flex-1`}
        />
        <button
          type="button"
          onClick={onUseGeolocation}
          className="mono text-[10px] tracking-[0.2em] uppercase border border-line bg-bg px-2 hover:border-accent hover:text-accent transition"
          title="現在地"
        >
          📍
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {REFERENCE_PRESETS.map((pr) => (
          <button
            key={pr.id}
            type="button"
            onClick={() => commit({ id: pr.id, lat: pr.lat, lng: pr.lng, label: pr.label })}
            className={`mono text-[9px] tracking-[0.16em] uppercase px-1.5 py-0.5 border transition ${
              value.id === pr.id
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {pr.label}
          </button>
        ))}
      </div>
      {open && (results.length > 0 || resolving || error) && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 border border-line bg-bg shadow-2xl max-h-[260px] overflow-auto">
          {resolving && <div className="px-3 py-2 mono text-[10px] text-muted">検索中…</div>}
          {error && <div className="px-3 py-2 mono text-[10px] text-accent">{error}</div>}
          {results.map((r, i) => (
            <button
              key={`${r.lat}-${r.lon}-${i}`}
              type="button"
              onClick={() => commit({
                id: "geocoded", lat: parseFloat(r.lat), lng: parseFloat(r.lon),
                label: r.display_name.split(",").slice(0, 2).join(", "),
              })}
              className="block w-full text-left px-3 py-2 text-[12px] hover:bg-[#262626] hover:text-accent transition border-b border-line last:border-b-0"
            >
              <div className="truncate">{r.display_name}</div>
              <div className="mono text-[9px] opacity-50 mt-0.5">
                {parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lon).toFixed(4)}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SortBar — Carsensor-style multi-axis sort header
// ──────────────────────────────────────────────────────────────────────────

const SORT_COLS: Array<{ label: string; ascKey: SortKey; descKey: SortKey; ascLabel: string; descLabel: string }> = [
  { label: "新着順",   ascKey: "newest",       descKey: "oldest",       ascLabel: "新", descLabel: "古" },
  { label: "時間料金", ascKey: "priceAsc",     descKey: "priceDesc",    ascLabel: "安", descLabel: "高" },
  { label: "日料金",   ascKey: "dailyAsc",     descKey: "dailyDesc",    ascLabel: "安", descLabel: "高" },
  { label: "天井",     ascKey: "ceilingDesc",  descKey: "ceilingAsc",   ascLabel: "高", descLabel: "低" },
  { label: "面積",     ascKey: "areaDesc",     descKey: "areaAsc",      ascLabel: "広", descLabel: "狭" },
  { label: "収容",     ascKey: "capacityDesc", descKey: "capacityAsc",  ascLabel: "多", descLabel: "少" },
  { label: "距離",     ascKey: "distanceAsc",  descKey: "distanceDesc", ascLabel: "近", descLabel: "遠" },
];

function SortBar({
  sort, setSort, resultCount, totalCount,
}: {
  sort: SortKey; setSort: (v: SortKey) => void;
  resultCount: number; totalCount: number;
}) {
  return (
    <div className="mt-4 border border-line bg-[#222] px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] mono">
      <div className="flex items-baseline gap-2">
        <span className="serif text-2xl text-accent">{resultCount.toLocaleString("ja-JP")}</span>
        <span className="tracking-[0.18em] uppercase opacity-60">件</span>
        <span className="opacity-40">/ {totalCount} 全</span>
      </div>

      <button
        type="button"
        onClick={() => setSort("newest")}
        className={`tracking-[0.22em] uppercase px-2 py-1 transition border ${
          sort === "newest"
            ? "border-accent text-accent"
            : "border-transparent text-muted hover:text-ink"
        }`}
      >
        元の並び順
      </button>

      <div className="flex flex-wrap items-stretch gap-x-3 gap-y-1 ml-auto">
        {SORT_COLS.map((c) => (
          <div key={c.label} className="flex flex-col items-center">
            <div className="mono text-[9px] tracking-[0.22em] uppercase opacity-50">
              {c.label}
            </div>
            <div className="flex">
              <button
                type="button"
                onClick={() => setSort(c.ascKey)}
                className={`px-1.5 py-0.5 mono text-[10px] tracking-[0.18em] uppercase transition ${
                  sort === c.ascKey
                    ? "bg-accent text-bg"
                    : "text-muted hover:text-accent"
                }`}
              >
                {c.ascLabel}
              </button>
              <span className="mono text-[10px] opacity-30 px-0.5">|</span>
              <button
                type="button"
                onClick={() => setSort(c.descKey)}
                className={`px-1.5 py-0.5 mono text-[10px] tracking-[0.18em] uppercase transition ${
                  sort === c.descKey
                    ? "bg-accent text-bg"
                    : "text-muted hover:text-accent"
                }`}
              >
                {c.descLabel}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// PropertyCardLite — unchanged from previous version
// ──────────────────────────────────────────────────────────────────────────

function PropertyCardLite({
  property, distanceKm, referenceLabel, highlighted,
}: {
  property: Property; distanceKm: number | null;
  referenceLabel: string; highlighted: boolean;
}) {
  const yen = property.hourlyPrice.toLocaleString("ja-JP");
  return (
    <Link
      href={`/properties/${property.id}`}
      className={`block border bg-bg overflow-hidden transition ${
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
        <div className="absolute top-2 left-2 mono text-[10px] tracking-[0.24em] uppercase bg-bg/70 backdrop-blur px-2 py-1 border border-line">
          {CATEGORY_LABEL[property.category]}
          {property.studioType ? ` · ${property.studioType}` : ""}
        </div>
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <div className="mono text-[10px] tracking-[0.24em] uppercase bg-accent text-bg px-2 py-1">3DGS</div>
          <div
            className="mono text-[9px] tracking-[0.2em] uppercase bg-bg/85 backdrop-blur border border-line px-1.5 py-0.5"
            title={`1 回視聴で ${property.tokenCost} トークン消費 — ${TOKEN_COST_LABEL[property.tokenCost]}`}
          >
            {property.tokenCost}T · {property.tokenCost === 1 ? "ハウス" : property.tokenCost === 2 ? "中規模" : "大規模"}
          </div>
        </div>
        {distanceKm !== null && (
          <div className="absolute bottom-2 right-2 mono text-[10px] tracking-[0.2em] uppercase bg-bg/80 backdrop-blur px-2 py-1 border border-line">
            {referenceLabel} から {formatKm(distanceKm)}
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted">
          {property.prefecture} / {property.city}
        </div>
        <h3 className="serif text-[1.05rem] leading-[1.45] line-clamp-2">
          {property.title}
        </h3>
        <div className="grid grid-cols-4 gap-1.5 text-[10px] mono text-muted">
          <Stat label="面積" value={`${property.floorAreaSqm}㎡`} />
          <Stat label="天井" value={property.ceilingHeightM ? `${property.ceilingHeightM}m` : "—"} />
          <Stat label="収容" value={`${property.capacity}名`} />
          <Stat label="駐車" value={property.parking ? "可" : "—"} accent={property.parking} />
        </div>
        {property.powerVoltage && (
          <div className="mono text-[10px] text-muted truncate">⚡ {property.powerVoltage}</div>
        )}
        <div className="flex items-baseline justify-between pt-2 border-t border-line">
          <div>
            <div>
              <span className="serif text-xl text-accent">¥{yen}</span>
              <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">/hr</span>
            </div>
            {property.dailyPrice > 0 && (
              <div className="mono text-[10px] text-muted mt-0.5">
                Day: ¥{property.dailyPrice.toLocaleString("ja-JP")}
              </div>
            )}
          </div>
          <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-60">詳細 →</span>
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
