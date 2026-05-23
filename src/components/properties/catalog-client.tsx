"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  CATEGORY_LABEL,
  REFERENCE_PRESETS,
  type Property,
  type PropertyCategory,
  type ReferencePresetId,
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
  | "ceilingDesc"
  | "areaDesc"
  | "capacityDesc"
  | "distanceAsc";

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
          <div className="flex gap-1">
            <select
              value={props.reference.id}
              onChange={(e) => {
                const id = e.target.value as ReferencePresetId | "current";
                const preset = REFERENCE_PRESETS.find((r) => r.id === id);
                if (preset) {
                  props.setReference({
                    id: preset.id,
                    lat: preset.lat,
                    lng: preset.lng,
                    label: preset.label,
                  });
                }
              }}
              className={field + " min-w-[140px]"}
            >
              {REFERENCE_PRESETS.map((r) => (
                <option key={r.id} value={r.id} className="bg-bg">
                  {r.label}
                </option>
              ))}
              {props.reference.id === "current" && (
                <option value="current" className="bg-bg">現在地</option>
              )}
            </select>
            <button
              type="button"
              onClick={props.useGeolocation}
              className="mono text-[10px] tracking-[0.2em] uppercase border border-line px-2 hover:border-accent hover:text-accent transition"
              title="ブラウザの現在地を取得"
            >
              📍
            </button>
          </div>
        </LabeledInput>

        <LabeledInput label="並び替え">
          <select
            value={props.sort}
            onChange={(e) => props.setSort(e.target.value as SortKey)}
            className={field + " min-w-[160px]"}
          >
            <option value="newest" className="bg-bg">新着順</option>
            <option value="distanceAsc" className="bg-bg">近い順 (参照地点から)</option>
            <option value="priceAsc" className="bg-bg">料金 安い順</option>
            <option value="priceDesc" className="bg-bg">料金 高い順</option>
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
          <input
            type="number"
            min={0}
            step={1000}
            value={props.maxPrice}
            onChange={(e) => props.setMaxPrice(numberOrEmpty(e.target.value))}
            placeholder="上限なし"
            className={field}
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
            <span className="serif text-xl text-accent">¥{yen}</span>
            <span className="mono text-[10px] tracking-[0.18em] opacity-50 ml-1">
              /hr
            </span>
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

// Suppress lint warning about unused import (kept for future extension)
void useEffect;
