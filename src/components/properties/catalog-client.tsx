"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  CATEGORY_LABEL,
  REFERENCE_PRESETS,
  type Property,
  type PropertyCategory,
} from "@/lib/schemas";
import { formatKm, haversineKm } from "@/lib/distance";

const CatalogMap = dynamic(() => import("./catalog-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full border border-line bg-[#070707] flex items-center justify-center">
      <span className="mono text-[10px] tracking-[0.3em] uppercase opacity-50 animate-pulse">
        Loading map…
      </span>
    </div>
  ),
});

interface Props {
  items: Property[];
  areas: string[];
  studioTypes: string[];
}

type SortKey =
  | "newest"
  | "priceAsc"
  | "priceDesc"
  | "dailyAsc"
  | "dailyDesc"
  | "ceilingDesc"
  | "areaDesc"
  | "capacityDesc"
  | "distanceAsc";

const HOURLY_PRESETS = [5000, 10000, 20000, 30000, 50000, 100000];
const DAILY_PRESETS  = [50000, 100000, 200000, 300000, 500000];

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

  // Filters
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<PropertyCategory | "all">("all");
  const [area, setArea] = useState<string>("all");
  const [studioType, setStudioType] = useState<string>("all");
  const [maxPrice, setMaxPrice] = useState<number | "">("");
  const [maxDailyPrice, setMaxDailyPrice] = useState<number | "">("");
  const [requiresDaily, setRequiresDaily] = useState(false);
  const [minCapacity, setMinCapacity] = useState<number | "">("");
  const [minArea, setMinArea] = useState<number | "">("");
  const [minCeiling, setMinCeiling] = useState<number | "">("");
  const [requiresParking, setRequiresParking] = useState(false);
  const [requires200V, setRequires200V] = useState(false);
  const [maxKmFromRef, setMaxKmFromRef] = useState<number | "">("");

  // Sort
  const [sort, setSort] = useState<SortKey>("newest");

  const reset = useCallback(() => {
    setQ("");
    setCategory("all");
    setArea("all");
    setStudioType("all");
    setMaxPrice("");
    setMaxDailyPrice("");
    setRequiresDaily(false);
    setMinCapacity("");
    setMinArea("");
    setMinCeiling("");
    setRequiresParking(false);
    setRequires200V(false);
    setMaxKmFromRef("");
    setSort("newest");
  }, []);

  // Compute distance + filtered + sorted list
  const computed = useMemo(() => {
    const withDist = items.map((p) => ({
      ...p,
      distanceKm: p.coords ? haversineKm(reference, p.coords) : null,
    }));

    const filtered = withDist.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (area !== "all" && p.area !== area) return false;
      if (studioType !== "all" && p.studioType !== studioType) return false;
      if (typeof maxPrice === "number" && p.hourlyPrice > maxPrice) return false;
      if (requiresDaily && (!p.dailyPrice || p.dailyPrice <= 0)) return false;
      if (
        typeof maxDailyPrice === "number" &&
        (!p.dailyPrice || p.dailyPrice > maxDailyPrice)
      ) {
        return false;
      }
      if (typeof minCapacity === "number" && p.capacity < minCapacity) return false;
      if (typeof minArea === "number" && p.floorAreaSqm < minArea) return false;
      if (typeof minCeiling === "number" && p.ceilingHeightM < minCeiling) return false;
      if (requiresParking && !p.parking) return false;
      if (requires200V && !/200\s*V/i.test(p.powerVoltage)) return false;
      if (
        typeof maxKmFromRef === "number" &&
        (p.distanceKm === null || p.distanceKm > maxKmFromRef)
      ) {
        return false;
      }
      if (q.trim()) {
        const haystack =
          `${p.title} ${p.summary} ${p.city} ${p.studioType} ${p.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case "priceAsc":      return a.hourlyPrice - b.hourlyPrice;
        case "priceDesc":     return b.hourlyPrice - a.hourlyPrice;
        case "dailyAsc":      return (a.dailyPrice || Infinity) - (b.dailyPrice || Infinity);
        case "dailyDesc":     return (b.dailyPrice || 0) - (a.dailyPrice || 0);
        case "ceilingDesc":   return b.ceilingHeightM - a.ceilingHeightM;
        case "areaDesc":      return b.floorAreaSqm - a.floorAreaSqm;
        case "capacityDesc":  return b.capacity - a.capacity;
        case "distanceAsc": {
          const ad = a.distanceKm ?? Infinity;
          const bd = b.distanceKm ?? Infinity;
          return ad - bd;
        }
        case "newest":
        default:
          return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      }
    });

    return filtered;
  }, [
    items,
    reference,
    category,
    area,
    studioType,
    maxPrice,
    maxDailyPrice,
    requiresDaily,
    minCapacity,
    minArea,
    minCeiling,
    requiresParking,
    requires200V,
    maxKmFromRef,
    q,
    sort,
  ]);

  const useGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      alert("お使いのブラウザはジオロケーションに対応していません。");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setReference({
          id: "current",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "現在地",
        });
      },
      (err) => {
        alert(`現在地を取得できませんでした: ${err.message}`);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);

  return (
    <div className="frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">CATALOG</span>
        <span>Find a Location</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <span className="opacity-60">
          {computed.length} / {items.length}
        </span>
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

      {/* Reference + filters bar */}
      <FiltersBar
        q={q} setQ={setQ}
        category={category} setCategory={setCategory}
        area={area} setArea={setArea}
        studioType={studioType} setStudioType={setStudioType}
        maxPrice={maxPrice} setMaxPrice={setMaxPrice}
        maxDailyPrice={maxDailyPrice} setMaxDailyPrice={setMaxDailyPrice}
        requiresDaily={requiresDaily} setRequiresDaily={setRequiresDaily}
        minCapacity={minCapacity} setMinCapacity={setMinCapacity}
        minArea={minArea} setMinArea={setMinArea}
        minCeiling={minCeiling} setMinCeiling={setMinCeiling}
        requiresParking={requiresParking} setRequiresParking={setRequiresParking}
        requires200V={requires200V} setRequires200V={setRequires200V}
        maxKmFromRef={maxKmFromRef} setMaxKmFromRef={setMaxKmFromRef}
        reference={reference} setReference={setReference}
        useGeolocation={useGeolocation}
        sort={sort} setSort={setSort}
        areas={areas}
        studioTypes={studioTypes}
        reset={reset}
      />

      {/* Main 2-column: cards | map */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_minmax(380px,_520px)] gap-6">
        {/* Card list */}
        <div>
          {computed.length === 0 ? (
            <div className="border border-line p-12 text-center">
              <div className="mono text-[12px] tracking-[0.3em] uppercase opacity-60 mb-3">
                No results
              </div>
              <p className="text-muted text-[14px]">
                条件に合致する物件が見つかりません。フィルターを緩めてください。
              </p>
            </div>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-5">
              {computed.map((p) => (
                <li
                  key={p.id}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition ${
                    hoveredId === p.id ? "outline outline-1 outline-accent" : ""
                  }`}
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

        {/* Map (sticky on lg+) */}
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

// --- FiltersBar ------------------------------------------------------------

interface FiltersProps {
  q: string; setQ: (v: string) => void;
  category: PropertyCategory | "all"; setCategory: (v: PropertyCategory | "all") => void;
  area: string; setArea: (v: string) => void;
  studioType: string; setStudioType: (v: string) => void;
  maxPrice: number | ""; setMaxPrice: (v: number | "") => void;
  maxDailyPrice: number | ""; setMaxDailyPrice: (v: number | "") => void;
  requiresDaily: boolean; setRequiresDaily: (v: boolean) => void;
  minCapacity: number | ""; setMinCapacity: (v: number | "") => void;
  minArea: number | ""; setMinArea: (v: number | "") => void;
  minCeiling: number | ""; setMinCeiling: (v: number | "") => void;
  requiresParking: boolean; setRequiresParking: (v: boolean) => void;
  requires200V: boolean; setRequires200V: (v: boolean) => void;
  maxKmFromRef: number | ""; setMaxKmFromRef: (v: number | "") => void;
  reference: Reference; setReference: (v: Reference) => void;
  useGeolocation: () => void;
  sort: SortKey; setSort: (v: SortKey) => void;
  areas: string[];
  studioTypes: string[];
  reset: () => void;
}

function FiltersBar(props: FiltersProps) {
  const numberOrEmpty = (v: string) => (v === "" ? "" : Number(v));
  return (
    <div className="border border-line bg-[#080808] p-5 space-y-4">
      {/* Row 1: search + reference + sort */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <LabeledInput label="Keyword">
          <input
            type="search"
            value={props.q}
            onChange={(e) => props.setQ(e.target.value)}
            placeholder="白ホリ / 渋谷 / ガレージ ..."
            className={field}
          />
        </LabeledInput>

        <LabeledInput label="参照地点 (距離計算)">
          <ReferencePicker
            value={props.reference}
            onChange={props.setReference}
            onUseGeolocation={props.useGeolocation}
          />
        </LabeledInput>

        <LabeledInput label="並び替え">
          <select
            value={props.sort}
            onChange={(e) => props.setSort(e.target.value as SortKey)}
            className={field + " min-w-[160px]"}
          >
            <option value="newest" className="bg-bg">新着順</option>
            <option value="distanceAsc" className="bg-bg">近い順 (参照地点から)</option>
            <option value="priceAsc" className="bg-bg">時間料金 安い順</option>
            <option value="priceDesc" className="bg-bg">時間料金 高い順</option>
            <option value="dailyAsc" className="bg-bg">日料金 安い順</option>
            <option value="dailyDesc" className="bg-bg">日料金 高い順</option>
            <option value="ceilingDesc" className="bg-bg">天井高 高い順</option>
            <option value="areaDesc" className="bg-bg">床面積 広い順</option>
            <option value="capacityDesc" className="bg-bg">収容 多い順</option>
          </select>
        </LabeledInput>
      </div>

      {/* Row 2: structured filters */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <LabeledInput label="カテゴリ">
          <select
            value={props.category}
            onChange={(e) => props.setCategory(e.target.value as PropertyCategory | "all")}
            className={field}
          >
            <option value="all" className="bg-bg">すべて</option>
            {(Object.keys(CATEGORY_LABEL) as PropertyCategory[]).map((c) => (
              <option key={c} value={c} className="bg-bg">{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </LabeledInput>

        <LabeledInput label="スタジオ種類">
          <select
            value={props.studioType}
            onChange={(e) => props.setStudioType(e.target.value)}
            className={field}
          >
            <option value="all" className="bg-bg">すべて</option>
            {props.studioTypes.map((s) => (
              <option key={s} value={s} className="bg-bg">{s}</option>
            ))}
          </select>
        </LabeledInput>

        <LabeledInput label="エリア">
          <select
            value={props.area}
            onChange={(e) => props.setArea(e.target.value)}
            className={field}
          >
            <option value="all" className="bg-bg">すべて</option>
            {props.areas.map((a) => (
              <option key={a} value={a} className="bg-bg">{a}</option>
            ))}
          </select>
        </LabeledInput>

        <LabeledInput label="参照から ≤ km">
          <input
            type="number"
            min={0}
            step={1}
            value={props.maxKmFromRef}
            onChange={(e) => props.setMaxKmFromRef(numberOrEmpty(e.target.value))}
            placeholder="制限なし"
            className={field}
          />
        </LabeledInput>

        <LabeledInput label="最大 ¥/hr">
          <PricePicker
            value={props.maxPrice}
            onChange={props.setMaxPrice}
            presets={HOURLY_PRESETS}
            placeholder="上限なし"
          />
        </LabeledInput>

        <LabeledInput label="最大 ¥/day">
          <PricePicker
            value={props.maxDailyPrice}
            onChange={props.setMaxDailyPrice}
            presets={DAILY_PRESETS}
            placeholder="上限なし"
          />
        </LabeledInput>

        <LabeledInput label="最低 収容">
          <input
            type="number"
            min={0}
            value={props.minCapacity}
            onChange={(e) => props.setMinCapacity(numberOrEmpty(e.target.value))}
            placeholder="—"
            className={field}
          />
        </LabeledInput>

        <LabeledInput label="最低 面積㎡">
          <input
            type="number"
            min={0}
            value={props.minArea}
            onChange={(e) => props.setMinArea(numberOrEmpty(e.target.value))}
            placeholder="—"
            className={field}
          />
        </LabeledInput>

        <LabeledInput label="最低 天井m">
          <input
            type="number"
            min={0}
            step={0.1}
            value={props.minCeiling}
            onChange={(e) => props.setMinCeiling(numberOrEmpty(e.target.value))}
            placeholder="—"
            className={field}
          />
        </LabeledInput>

        <LabeledInput label="日料金あり">
          <ToggleSwitch
            value={props.requiresDaily}
            onChange={props.setRequiresDaily}
            label="必須"
          />
        </LabeledInput>

        <LabeledInput label="駐車場あり">
          <ToggleSwitch
            value={props.requiresParking}
            onChange={props.setRequiresParking}
            label="必須"
          />
        </LabeledInput>

        <LabeledInput label="200V 電源">
          <ToggleSwitch
            value={props.requires200V}
            onChange={props.setRequires200V}
            label="必須"
          />
        </LabeledInput>

        <div className="md:col-span-2 flex items-end justify-end">
          <button
            type="button"
            onClick={props.reset}
            className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-4 py-2 hover:border-ink transition"
          >
            すべてリセット
          </button>
        </div>
      </div>
    </div>
  );
}

const field =
  "w-full bg-transparent border-b border-line py-1.5 text-[13px] mono focus:outline-none focus:border-accent transition";

function LabeledInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block mono text-[9px] tracking-[0.26em] uppercase opacity-60 mb-0.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleSwitch({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 mt-0.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[#ffb454]"
      />
      <span className="text-[12px]">{label}</span>
    </label>
  );
}

// --- PropertyCardLite ------------------------------------------------------

function PropertyCardLite({
  property,
  distanceKm,
  referenceLabel,
  highlighted,
}: {
  property: Property;
  distanceKm: number | null;
  referenceLabel: string;
  highlighted: boolean;
}) {
  const yen = property.hourlyPrice.toLocaleString("ja-JP");
  return (
    <Link
      href={`/properties/${property.id}`}
      className={`block border bg-bg overflow-hidden transition ${
        highlighted ? "border-accent" : "border-line hover:border-ink"
      }`}
    >
      <div className="relative aspect-[16/10] bg-[#0a0a0a] overflow-hidden">
        {property.cover.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.cover.src}
            alt={property.cover.alt}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center mono text-[10px] opacity-40">
            no cover
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 pointer-events-none" />
        <div className="absolute top-2 left-2 mono text-[10px] tracking-[0.24em] uppercase bg-bg/70 backdrop-blur px-2 py-1 border border-line">
          {CATEGORY_LABEL[property.category]}
          {property.studioType ? ` · ${property.studioType}` : ""}
        </div>
        <div className="absolute top-2 right-2 mono text-[10px] tracking-[0.24em] uppercase bg-accent text-bg px-2 py-1">
          3DGS
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
          <Stat
            label="駐車"
            value={property.parking ? "可" : "—"}
            accent={property.parking}
          />
        </div>

        {property.powerVoltage && (
          <div className="mono text-[10px] text-muted truncate">
            ⚡ {property.powerVoltage}
          </div>
        )}

        <div className="flex items-baseline justify-between pt-2 border-t border-line">
          <div>
            <div>
              <span className="serif text-xl text-accent">¥{yen}</span>
              <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">
                /hr
              </span>
            </div>
            {property.dailyPrice > 0 && (
              <div className="mono text-[10px] text-muted mt-0.5">
                Day: ¥{property.dailyPrice.toLocaleString("ja-JP")}
              </div>
            )}
          </div>
          <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-60">
            詳細 →
          </span>
        </div>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border-l border-line pl-2">
      <div className="opacity-50 text-[9px] uppercase tracking-[0.2em]">{label}</div>
      <div className={accent ? "text-accent" : "text-ink"}>{value}</div>
    </div>
  );
}

// --- PricePicker -----------------------------------------------------------

function PricePicker({
  value,
  onChange,
  presets,
  placeholder,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  presets: number[];
  placeholder: string;
}) {
  const fmtChip = (n: number) =>
    n >= 10000 ? `¥${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万` : `¥${n.toLocaleString("ja-JP")}`;
  return (
    <div>
      <input
        type="number"
        min={0}
        step={1000}
        value={value}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : Number(e.target.value))
        }
        placeholder={placeholder}
        className={field}
      />
      <div className="flex flex-wrap gap-1 mt-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`mono text-[9px] tracking-[0.16em] uppercase px-1.5 py-0.5 border transition ${
              value === p
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-ink hover:text-ink"
            }`}
          >
            ≤ {fmtChip(p)}
          </button>
        ))}
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="mono text-[9px] tracking-[0.16em] uppercase px-1.5 py-0.5 border border-line text-muted hover:border-accent hover:text-accent transition"
          >
            ✕ クリア
          </button>
        )}
      </div>
    </div>
  );
}

// --- ReferencePicker -------------------------------------------------------

interface GeocodeHit {
  display_name: string;
  lat: string;
  lon: string;
}

function ReferencePicker({
  value,
  onChange,
  onUseGeolocation,
}: {
  value: Reference;
  onChange: (v: Reference) => void;
  onUseGeolocation: () => void;
}) {
  const [query, setQuery] = useState(value.label);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const lastReqRef = useRef(0);

  // Keep input synced when reference changes externally (e.g. geolocation button).
  useEffect(() => {
    setQuery(value.label);
  }, [value.label]);

  // Debounced live geocoding for non-coord queries (>= 2 chars).
  useEffect(() => {
    const trimmed = query.trim();
    setError(null);
    if (trimmed === value.label) {
      // No change, no need to search
      setResults([]);
      return;
    }
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    if (/(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/.test(trimmed)) {
      // Coord format — no geocoding needed, results stay empty
      setResults([]);
      return;
    }
    const reqId = ++lastReqRef.current;
    const t = setTimeout(async () => {
      setResolving(true);
      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=json&limit=5&q=" +
          encodeURIComponent(trimmed);
        const r = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        const j: GeocodeHit[] = await r.json();
        if (reqId !== lastReqRef.current) return; // stale
        setResults(j);
      } catch {
        if (reqId === lastReqRef.current) setError("検索に失敗しました");
      } finally {
        if (reqId === lastReqRef.current) setResolving(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, value.label]);

  const commit = useCallback(
    (next: Reference) => {
      onChange(next);
      setQuery(next.label);
      setOpen(false);
      setResults([]);
    },
    [onChange],
  );

  const tryResolveText = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    // 1. exact preset
    const preset = REFERENCE_PRESETS.find(
      (r) => r.label === trimmed || r.id === trimmed,
    );
    if (preset) {
      commit({
        id: preset.id,
        lat: preset.lat,
        lng: preset.lng,
        label: preset.label,
      });
      return;
    }

    // 2. lat,lng paste
    const m = trimmed.match(/(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/);
    if (m) {
      commit({
        id: "custom",
        lat: parseFloat(m[1]),
        lng: parseFloat(m[2]),
        label: trimmed,
      });
      return;
    }

    // 3. first geocode result, if available
    if (results.length > 0) {
      const r = results[0];
      commit({
        id: "geocoded",
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        label: trimmed,
      });
    }
  }, [query, results, commit]);

  return (
    <div className="relative">
      <div className="flex gap-1">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              tryResolveText();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="渋谷駅 / 大阪駅 / 35.66, 139.70 / 新宿区..."
          className={field + " min-w-[180px]"}
        />
        <button
          type="button"
          onClick={onUseGeolocation}
          className="mono text-[10px] tracking-[0.2em] uppercase border border-line px-2 hover:border-accent hover:text-accent transition"
          title="ブラウザの現在地を取得"
        >
          📍
        </button>
      </div>

      {/* Preset chips for quick-pick */}
      <div className="flex flex-wrap gap-1 mt-1.5">
        {REFERENCE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              commit({
                id: p.id,
                lat: p.lat,
                lng: p.lng,
                label: p.label,
              })
            }
            className={`mono text-[9px] tracking-[0.16em] uppercase px-1.5 py-0.5 border transition ${
              value.id === p.id
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Dropdown with live results */}
      {open && (results.length > 0 || resolving || error) && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 border border-line bg-bg shadow-2xl max-h-[260px] overflow-auto">
          {resolving && (
            <div className="px-3 py-2 mono text-[10px] text-muted">
              検索中…
            </div>
          )}
          {error && (
            <div className="px-3 py-2 mono text-[10px] text-accent">
              {error}
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.lat}-${r.lon}-${i}`}
              type="button"
              onClick={() =>
                commit({
                  id: "geocoded",
                  lat: parseFloat(r.lat),
                  lng: parseFloat(r.lon),
                  label: r.display_name.split(",").slice(0, 2).join(", "),
                })
              }
              className="block w-full text-left px-3 py-2 text-[12px] hover:bg-[#0d0d0d] hover:text-accent transition border-b border-line last:border-b-0"
            >
              <div className="truncate">{r.display_name}</div>
              <div className="mono text-[9px] opacity-50 mt-0.5">
                {parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lon).toFixed(4)}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Click-outside backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
    </div>
  );
}

// Suppress lint warning about unused import (kept for future extension)
void useEffect;
