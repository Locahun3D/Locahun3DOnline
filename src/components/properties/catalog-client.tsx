"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CATEGORY_LABEL,
  REFERENCE_PRESETS,
  categoryLabel,
  tokenCostLabel,
  isNewProperty,
  presetLabel,
  type Property,
  type PropertyCategory,
} from "@/lib/schemas";
import { formatKm, haversineKm } from "@/lib/distance";
import BookmarkButton from "@/components/bookmark-button";
import { useLocale } from "@/components/locale-provider";

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
const CEILING_OPTS   = [2.0, 2.5, 3.0, 4.0, 5.0, 7.0, 10.0];
const DISTANCE_OPTS  = [5, 10, 30, 50, 100, 200, 500];

interface ReviewStat { average: number; count: number }

interface Props {
  items: Property[];
  areas: string[];
  studioTypes: string[];
  bookmarkedIds?: string[];
  signedIn?: boolean;
  reviewStats?: Record<string, ReviewStat>;
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

// ── 追加条件: 設備・機能タグ ─────────────────────────────────────────────────
// 物件の tags / summary / studioType に対するテキストマッチで絞り込む (複数選択は AND)。
// マッチは日本語(ja)で行い、英語版では表示ラベルだけ en に差し替える。
type FacilityTag = { ja: string; en: string };
const FACILITY_TAGS: FacilityTag[] = [
  { ja: "ライブ使用", en: "Live use" },
  { ja: "クロマキー", en: "Chroma key" },
  { ja: "控室", en: "Green room" },
  { ja: "同録", en: "Sync sound" },
  { ja: "電動昇降トラス", en: "Motorized truss" },
  { ja: "音響システム", en: "Sound system" },
  { ja: "照明システム", en: "Lighting rig" },
  { ja: "可動式ステージ", en: "Movable stage" },
  { ja: "ネット回線", en: "Internet" },
  { ja: "音出し", en: "Amplified sound OK" },
  { ja: "高速インターネット", en: "High-speed internet" },
  { ja: "楽器演奏", en: "Live instruments" },
  { ja: "完全遮光", en: "Full blackout" },
  { ja: "トラック搬入口", en: "Truck loading bay" },
];

// 1段目に出す主要タグ (日料金/駐車場/200V の3トグルと同じ行に並べる)。
const FACILITY_PRIMARY_JA = ["クロマキー", "ネット回線"];
const FACILITY_PRIMARY = FACILITY_TAGS.filter((f) => FACILITY_PRIMARY_JA.includes(f.ja));
const FACILITY_SECONDARY = FACILITY_TAGS.filter((f) => !FACILITY_PRIMARY_JA.includes(f.ja));

// ── 検索条件の履歴 (localStorage) ───────────────────────────────────────────
// ユーザーが過去に打ち込んだフィルタ一式を丸ごと保存し、ワンクリックで再適用する。
type FilterSnapshot = {
  q: string;
  category: PropertyCategory | "all";
  area: string;
  studioType: string;
  minPrice: number | ""; maxPrice: number | "";
  minDailyPrice: number | ""; maxDailyPrice: number | "";
  minCeiling: number | ""; maxCeiling: number | "";
  maxKmFromRef: number | "";
  requiresDaily: boolean; requiresParking: boolean; requires200V: boolean;
  facilities: string[];
  reference: Reference;
  sort: SortKey;
};

const RECENT_KEY = "locahun3d:recent-filters:v2";
const RECENT_MAX = 5;

function rangePart(lo: number | "", hi: number | "", label: string, fmt: (n: number) => string): string | null {
  const hasLo = typeof lo === "number";
  const hasHi = typeof hi === "number";
  if (!hasLo && !hasHi) return null;
  if (hasLo && hasHi) return `${label} ${fmt(lo)}〜${fmt(hi)}`;
  if (hasHi) return `${label} 〜${fmt(hi)}`;
  return `${label} ${fmt(lo as number)}〜`;
}

/** 条件セットを人間可読な短い文字列に要約 (空なら "")。 */
function describeSnapshot(s: FilterSnapshot, en = false): string {
  const yenFmt = (n: number) =>
    en
      ? `¥${n.toLocaleString("en-US")}`
      : n >= 10000 ? `¥${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万` : `¥${n.toLocaleString("ja-JP")}`;
  const parts: string[] = [];
  if (s.q.trim()) parts.push(`"${s.q.trim()}"`);
  if (s.category !== "all") parts.push(categoryLabel(s.category, en ? "en" : "ja"));
  if (s.studioType !== "all") parts.push(s.studioType);
  if (s.area !== "all") parts.push(s.area);
  const pr = rangePart(s.minPrice, s.maxPrice, en ? "hr" : "時", yenFmt); if (pr) parts.push(pr);
  const dp = rangePart(s.minDailyPrice, s.maxDailyPrice, en ? "day" : "日", yenFmt); if (dp) parts.push(dp);
  const ce = rangePart(s.minCeiling, s.maxCeiling, en ? "ceil." : "天井", (n) => `${n}m`); if (ce) parts.push(ce);
  if (typeof s.maxKmFromRef === "number") parts.push(`${s.reference.label}≤${s.maxKmFromRef}km`);
  if (s.requiresDaily) parts.push(en ? "daily" : "日貸し可");
  if (s.requiresParking) parts.push(en ? "parking" : "駐車場");
  if (s.requires200V) parts.push("200V");
  for (const f of s.facilities ?? []) {
    const tag = FACILITY_TAGS.find((t) => t.ja === f);
    parts.push(en && tag ? tag.en : f);
  }
  return parts.join(" / ");
}

/** 重複判定・保存可否のための安定キー (条件のみ。sort は無視)。 */
function snapshotKey(s: FilterSnapshot): string {
  return JSON.stringify([
    s.q.trim(), s.category, s.area, s.studioType,
    s.minPrice, s.maxPrice, s.minDailyPrice, s.maxDailyPrice,
    s.minCeiling, s.maxCeiling,
    s.maxKmFromRef, s.requiresDaily, s.requiresParking, s.requires200V,
    [...(s.facilities ?? [])].sort(),
    typeof s.maxKmFromRef === "number" ? s.reference.id : null,
  ]);
}

/** 最近の検索条件を localStorage に保持するフック。 */
function useRecentFilters() {
  const [recent, setRecent] = useState<FilterSnapshot[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecent(parsed.slice(0, RECENT_MAX));
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const persist = useCallback((next: FilterSnapshot[]) => {
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* quota / private mode */ }
  }, []);

  const record = useCallback((s: FilterSnapshot) => {
    if (!describeSnapshot(s)) return; // 空条件は保存しない
    const key = snapshotKey(s);
    setRecent((prev) => {
      const next = [s, ...prev.filter((x) => snapshotKey(x) !== key)].slice(0, RECENT_MAX);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const remove = useCallback((key: string) => {
    setRecent((prev) => {
      const next = prev.filter((x) => snapshotKey(x) !== key);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const clear = useCallback(() => persist([]), [persist]);

  return { recent, record, remove, clear };
}

export default function CatalogClient({
  items, areas, studioTypes, bookmarkedIds = [], signedIn = false, reviewStats = {},
}: Props) {
  const bookmarkedSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);
  const router = useRouter();
  const en = useLocale() === "en";
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [reference, setReference] = useState<Reference>(() => ({
    ...DEFAULT_REF,
    label: presetLabel(DEFAULT_REF.id, en ? "en" : "ja") ?? DEFAULT_REF.label,
  }));
  const [geoMsg, setGeoMsg] = useState("");

  // Filters (dual ranges where it makes sense)
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<PropertyCategory | "all">("all");
  const [area, setArea] = useState<string>("all");
  const [studioType, setStudioType] = useState<string>("all");
  const [minPrice, setMinPrice] = useState<number | "">("");
  const [maxPrice, setMaxPrice] = useState<number | "">("");
  const [minDailyPrice, setMinDailyPrice] = useState<number | "">("");
  const [maxDailyPrice, setMaxDailyPrice] = useState<number | "">("");
  const [minCeiling, setMinCeiling] = useState<number | "">("");
  const [maxCeiling, setMaxCeiling] = useState<number | "">("");
  const [maxKmFromRef, setMaxKmFromRef] = useState<number | "">("");
  const [requiresDaily, setRequiresDaily] = useState(false);
  const [requiresParking, setRequiresParking] = useState(false);
  const [requires200V, setRequires200V] = useState(false);
  const [facilities, setFacilities] = useState<string[]>([]);

  // Sort
  const [sort, setSort] = useState<SortKey>("newest");

  const reset = useCallback(() => {
    setQ("");
    setCategory("all"); setArea("all"); setStudioType("all");
    setMinPrice(""); setMaxPrice("");
    setMinDailyPrice(""); setMaxDailyPrice("");
    setMinCeiling(""); setMaxCeiling("");
    setMaxKmFromRef("");
    setRequiresDaily(false); setRequiresParking(false); setRequires200V(false);
    setFacilities([]);
    setSort("newest");
  }, []);

  // ── 検索条件の履歴 ────────────────────────────────────────────────────────
  const { recent, record, remove: removeRecent } = useRecentFilters();

  const snapshot = useMemo<FilterSnapshot>(() => ({
    q, category, area, studioType,
    minPrice, maxPrice, minDailyPrice, maxDailyPrice,
    minCeiling, maxCeiling,
    maxKmFromRef, requiresDaily, requiresParking, requires200V,
    facilities,
    reference, sort,
  }), [
    q, category, area, studioType,
    minPrice, maxPrice, minDailyPrice, maxDailyPrice,
    minCeiling, maxCeiling,
    maxKmFromRef, requiresDaily, requiresParking, requires200V,
    facilities,
    reference, sort,
  ]);

  // 入力が 1.2s 落ち着いたら履歴へ自動保存 (空条件は record 側で弾く)
  useEffect(() => {
    const t = setTimeout(() => record(snapshot), 1200);
    return () => clearTimeout(t);
  }, [snapshot, record]);

  const applySnapshot = useCallback((s: FilterSnapshot) => {
    setQ(s.q);
    setCategory(s.category); setArea(s.area); setStudioType(s.studioType);
    setMinPrice(s.minPrice); setMaxPrice(s.maxPrice);
    setMinDailyPrice(s.minDailyPrice); setMaxDailyPrice(s.maxDailyPrice);
    setMinCeiling(s.minCeiling); setMaxCeiling(s.maxCeiling);
    setMaxKmFromRef(s.maxKmFromRef);
    setRequiresDaily(s.requiresDaily); setRequiresParking(s.requiresParking); setRequires200V(s.requires200V);
    setFacilities(s.facilities ?? []);
    setReference(s.reference);
    setSort(s.sort);
  }, []);

  // 初回マウント時、保存済みの最新条件 (= 最後に検索した条件) を自動復元する。
  // recent は localStorage から非同期で読まれるため、読み込まれ次第 1 度だけ適用。
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || recent.length === 0) return;
    restoredRef.current = true;
    applySnapshot(recent[0]);
  }, [recent, applySnapshot]);

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
      if (rangeOk(minCeiling, maxCeiling)) {
        if (typeof minCeiling === "number" && p.ceilingHeightM < minCeiling) return false;
        if (typeof maxCeiling === "number" && p.ceilingHeightM > maxCeiling) return false;
      }
      if (typeof maxKmFromRef === "number" &&
          (p.distanceKm === null || p.distanceKm > maxKmFromRef)) return false;
      if (requiresDaily && (!p.dailyPrice || p.dailyPrice <= 0)) return false;
      if (requiresParking && !p.parking) return false;
      if (requires200V && !/200\s*V/i.test(p.powerVoltage)) return false;
      if (facilities.length) {
        const hay = `${p.title} ${p.summary} ${p.studioType} ${p.tags.join(" ")}`.toLowerCase();
        if (!facilities.every((f) => hay.includes(f.toLowerCase()))) return false;
      }
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
    minCeiling, maxCeiling,
    maxKmFromRef,
    requiresDaily, requiresParking, requires200V,
    facilities,
    q, sort,
  ]);

  const useGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMsg(
        en
          ? "Your browser does not support geolocation."
          : "お使いのブラウザはジオロケーションに対応していません。",
      );
      setTimeout(() => setGeoMsg(""), 4000);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setReference({
        id: "current", lat: pos.coords.latitude, lng: pos.coords.longitude,
        label: en ? "Current location" : "現在地",
      }),
      () => {
        setGeoMsg(
          en
            ? "Could not get your location. Please allow location access in your browser."
            : "現在地を取得できませんでした。ブラウザの位置情報を許可してください。",
        );
        setTimeout(() => setGeoMsg(""), 4000);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [en]);

  return (
    <div className="frame-wide pt-5 pb-32">
      <div className="chapter-rule" style={{ marginBottom: 16 }}>
        <span className="opacity-60">CATALOG</span>
        <span>Find a Location</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      {/* Top band: search panel (left) + map (right), flush to the same height */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(380px,_520px)] 2xl:grid-cols-[1fr_minmax(520px,_720px)] gap-6">
        <div className="min-w-0">
          <FiltersPanel
            q={q} setQ={setQ}
            category={category} setCategory={setCategory}
            area={area} setArea={setArea} areas={areas}
            studioType={studioType} setStudioType={setStudioType} studioTypes={studioTypes}
            reference={reference} setReference={setReference} useGeolocation={useGeolocation} geoMsg={geoMsg}
            minPrice={minPrice} setMinPrice={setMinPrice}
            maxPrice={maxPrice} setMaxPrice={setMaxPrice}
            minDailyPrice={minDailyPrice} setMinDailyPrice={setMinDailyPrice}
            maxDailyPrice={maxDailyPrice} setMaxDailyPrice={setMaxDailyPrice}
            minCeiling={minCeiling} setMinCeiling={setMinCeiling}
            maxCeiling={maxCeiling} setMaxCeiling={setMaxCeiling}
            maxKmFromRef={maxKmFromRef} setMaxKmFromRef={setMaxKmFromRef}
            requiresDaily={requiresDaily} setRequiresDaily={setRequiresDaily}
            requiresParking={requiresParking} setRequiresParking={setRequiresParking}
            requires200V={requires200V} setRequires200V={setRequires200V}
            facilities={facilities} setFacilities={setFacilities}
            reset={reset}
            recent={recent} applyRecent={applySnapshot} removeRecent={removeRecent}
            resultCount={computed.length} totalCount={items.length}
          />
        </div>

        {/* Map: stretches to match the panel height (面一), no scroll-follow.
            モバイルでは高さを抑えて結果カードを早く見せる。 */}
        <div className="h-[30vh] sm:h-[44vh] lg:h-auto">
          <CatalogMap
            items={computed}
            hoveredId={hoveredId}
            reference={reference}
            onMarkerHover={(id) => setHoveredId(id)}
            onMarkerClick={(id) => router.push(`/properties/${id}`)}
          />
        </div>
      </div>

      <SortBar sort={sort} setSort={setSort} resultCount={computed.length} totalCount={items.length} />

      {/* Cards span the full width below the band → maximum card area */}
      <div className="mt-4">
        {computed.length === 0 ? (
          <div className="border border-line p-12 text-center">
            <div className="mono text-[12px] tracking-[0.3em] uppercase opacity-60 mb-3">
              No results
            </div>
            <p className="text-muted text-[14px]">
              {en
                ? "No locations match your filters. Try loosening them."
                : "条件に合致する物件が見つかりません。フィルタを緩めてください。"}
            </p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2200px]:grid-cols-6 gap-5">
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
                  bookmarked={bookmarkedSet.has(p.id)}
                  signedIn={signedIn}
                  reviewStat={reviewStats[p.id]}
                />
              </li>
            ))}
          </ul>
        )}
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
  reference: Reference; setReference: (v: Reference) => void; useGeolocation: () => void; geoMsg: string;
  minPrice: number | ""; setMinPrice: (v: number | "") => void;
  maxPrice: number | ""; setMaxPrice: (v: number | "") => void;
  minDailyPrice: number | ""; setMinDailyPrice: (v: number | "") => void;
  maxDailyPrice: number | ""; setMaxDailyPrice: (v: number | "") => void;
  minCeiling: number | ""; setMinCeiling: (v: number | "") => void;
  maxCeiling: number | ""; setMaxCeiling: (v: number | "") => void;
  maxKmFromRef: number | ""; setMaxKmFromRef: (v: number | "") => void;
  requiresDaily: boolean; setRequiresDaily: (v: boolean) => void;
  requiresParking: boolean; setRequiresParking: (v: boolean) => void;
  requires200V: boolean; setRequires200V: (v: boolean) => void;
  facilities: string[]; setFacilities: (v: string[]) => void;
  reset: () => void;
  recent: FilterSnapshot[];
  applyRecent: (s: FilterSnapshot) => void;
  removeRecent: (key: string) => void;
  resultCount: number; totalCount: number;
}

function FiltersPanel(p: FiltersProps) {
  // モバイルは検索UIを既定で畳み、物件カードを早く見せる (lg+ は常時展開で従来通り)。
  const [open, setOpen] = useState(false);
  const en = useLocale() === "en";
  const yenFmt = (n: number) =>
    en
      ? `¥${n.toLocaleString("en-US")}`
      : n >= 10000
        ? `¥${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万`
        : `¥${n.toLocaleString("ja-JP")}`;

  return (
    <div className="border border-line bg-[#222] p-3.5 space-y-2.5">
      {/* モバイル: 検索UIを既定で畳むトグル (lg未満のみ表示)。畳んでカードを早く見せる。 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="lg:hidden w-full flex items-center justify-between border border-line bg-[#2a2a2a] px-3 py-2.5 hover:border-accent transition"
      >
        <span className="mono text-[11px] tracking-[0.2em] uppercase">🔍 {en ? "Filters" : "絞り込み検索"}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="brand text-accent text-lg leading-none">{p.resultCount}</span>
          <span className="text-[11px] opacity-60">{en ? "" : "件"}</span>
          <span className="text-[12px] opacity-70 ml-1">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {/* 折りたたみ本体: モバイルは open のときだけ展開 / lg+ は常時展開 */}
      <div className={`${open ? "block" : "hidden"} lg:block space-y-2.5`}>
      {/* 最近の検索条件: 常時・1行固定高さ (横スクロール) でパネル高さを安定させ、
          チップ出現/折り返しによる枠全体のサイズ変動を防ぐ。 */}
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap min-h-[30px]">
        <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-50 mr-0.5 shrink-0">
          {en ? "Recent" : "最近の条件"}
        </span>
        {p.recent.length === 0 ? (
          <span className="text-[11px] text-muted/60 shrink-0">{en ? "None" : "なし"}</span>
        ) : (
          p.recent.map((s) => {
            const key = snapshotKey(s);
            const label = describeSnapshot(s, en);
            return (
              <span
                key={key}
                className="group inline-flex items-center border border-line bg-[#2c2c2c] hover:border-accent transition rounded-none shrink-0"
              >
                <button
                  type="button"
                  onClick={() => p.applyRecent(s)}
                  title={label}
                  className="font-sans text-[11px] text-ink/85 group-hover:text-accent transition px-2 py-1 max-w-[220px] truncate text-left"
                >
                  {label}
                </button>
                <button
                  type="button"
                  onClick={() => p.removeRecent(key)}
                  aria-label={en ? "Remove this filter" : "この条件を削除"}
                  className="px-1.5 py-1 text-[12px] leading-none text-muted hover:text-ink border-l border-line/70 transition"
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>

      {/* Left: keyword + additional-condition toggles · Right: reference/distance */}
      <div className="grid xl:grid-cols-2 gap-x-6 gap-y-2.5">
        <div className="space-y-2.5">
          <Row label={en ? "Keyword" : "キーワード"}>
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={p.q}
                onChange={(e) => p.setQ(e.target.value)}
                placeholder={en ? "white cyc / Shibuya / garage ..." : "白ホリ / 渋谷 / ガレージ ..."}
                className={inputWhiteCls + " w-full max-w-xs"}
              />
              <button
                type="button"
                onClick={p.reset}
                className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-ink transition whitespace-nowrap"
              >
                ✕ {en ? "Reset all" : "すべてリセット"}
              </button>
            </div>
          </Row>
        </div>

        <Row label={en ? "Reference / distance" : "参照地点 / 距離"}>
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex-1 min-w-[220px]">
              <ReferencePicker
                value={p.reference}
                onChange={p.setReference}
                onUseGeolocation={p.useGeolocation}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0 sm:pt-0.5">
              <span className="mono text-[10px] tracking-[0.22em] uppercase opacity-60">
                {en ? "within" : "から"}
              </span>
              <ChoiceSelect
                value={p.maxKmFromRef}
                onChange={p.setMaxKmFromRef}
                options={DISTANCE_OPTS}
                format={(v) => `${v}km`}
                emptyLabel={en ? "No limit" : "制限なし"}
              />
              {!en && (
                <span className="mono text-[10px] tracking-[0.22em] uppercase opacity-60">
                  以内
                </span>
              )}
            </div>
          </div>
          {p.geoMsg && (
            <div className="mt-1 mono text-[10px] text-amber-500">
              {p.geoMsg}
            </div>
          )}
        </Row>
      </div>

      <Divider />

      {/* Categorical: category, studioType, area */}
      <Row label={en ? "Type / area" : "種別 / エリア"}>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <ChoiceSelect
            value={p.category}
            onChange={(v) => p.setCategory(v as PropertyCategory | "all")}
            options={Object.keys(CATEGORY_LABEL) as PropertyCategory[]}
            format={(v) => categoryLabel(v as PropertyCategory, en ? "en" : "ja")}
            emptyLabel={en ? "Category — all" : "カテゴリ すべて"}
          />
          <ChoiceSelect
            value={p.studioType === "all" ? "" : p.studioType}
            onChange={(v) => p.setStudioType(v === "" ? "all" : v)}
            options={p.studioTypes}
            emptyLabel={en ? "Studio type — all" : "スタジオ種類 すべて"}
          />
          <ComboPicker
            value={p.area}
            onChange={p.setArea}
            options={p.areas}
            placeholder={en ? "Area (typing OK)" : "エリア (打ち込みも可)"}
          />
        </div>
      </Row>

      <Divider />

      {/* Range filters — 地図サイドバーで狭まった列だと2列はラベルが重なるため、
          十分な幅(2xl)になってから2列化。列間の余白も広めに。 */}
      <div className="grid 2xl:grid-cols-2 gap-x-8 gap-y-2">
        <div className="space-y-2">
          <RangeRow
            label={en ? "Hourly (¥/hr)" : "時間料金 (¥/hr)"}
            min={p.minPrice} max={p.maxPrice}
            setMin={p.setMinPrice} setMax={p.setMaxPrice}
            options={PRICE_HR_OPTS} format={yenFmt}
          />
          <RangeRow
            label={en ? "Daily (¥/day)" : "日料金 (¥/day)"}
            min={p.minDailyPrice} max={p.maxDailyPrice}
            setMin={p.setMinDailyPrice} setMax={p.setMaxDailyPrice}
            options={PRICE_DAY_OPTS} format={yenFmt}
          />
        </div>
        <div className="space-y-2">
          <RangeRow
            label={en ? "Ceiling (m)" : "天井高 (m)"}
            min={p.minCeiling} max={p.maxCeiling}
            setMin={p.setMinCeiling} setMax={p.setMaxCeiling}
            options={CEILING_OPTS} format={(v) => `${v}m`}
          />
        </div>
      </div>

      <Divider />

      {/* Additional conditions */}
      <Row label={en ? "Extra filters" : "追加条件"}>
        <div className="space-y-2">
          {/* 1段目: 主要トグル + 主要設備タグ */}
          <div className="flex flex-wrap items-center gap-1.5">
            <ToggleChip label={en ? "Daily rate" : "日料金あり"} value={p.requiresDaily} onChange={p.setRequiresDaily} />
            <ToggleChip label={en ? "Parking" : "駐車場あり"} value={p.requiresParking} onChange={p.setRequiresParking} />
            <ToggleChip label={en ? "200V power" : "200V 電源"} value={p.requires200V} onChange={p.setRequires200V} />
            {FACILITY_PRIMARY.map((f) => (
              <FacilityChip
                key={f.ja}
                label={en ? f.en : f.ja}
                active={p.facilities.includes(f.ja)}
                onClick={() =>
                  p.setFacilities(
                    p.facilities.includes(f.ja)
                      ? p.facilities.filter((x) => x !== f.ja)
                      : [...p.facilities, f.ja],
                  )
                }
              />
            ))}
          </div>
          {/* 2段目: その他の設備タグ */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-line/50">
            {FACILITY_SECONDARY.map((f) => (
              <FacilityChip
                key={f.ja}
                label={en ? f.en : f.ja}
                active={p.facilities.includes(f.ja)}
                onClick={() =>
                  p.setFacilities(
                    p.facilities.includes(f.ja)
                      ? p.facilities.filter((x) => x !== f.ja)
                      : [...p.facilities, f.ja],
                  )
                }
              />
            ))}
          </div>
        </div>
      </Row>
      </div>
    </div>
  );
}

// All filter inputs/selects use a light-gray field — dark text on gray so every
// entry point reads as "type/pick here" against the dark panel.
const inputCls =
  "bg-neutral-300 text-black border border-line px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-accent transition placeholder:text-black/40 truncate";

// Alias kept for the keyword search (identical gray style).
const inputWhiteCls = inputCls;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid md:grid-cols-[92px_1fr] gap-2.5 items-start">
      <div className="text-[12px] font-medium text-ink/80 pt-1.5 leading-snug">
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
      className={`px-3 py-1.5 min-h-[34px] inline-flex items-center font-sans text-[11px] border transition ${
        value
          ? "border-accent text-accent bg-[#0e1a20]"
          : "border-line text-muted hover:border-ink hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

// 設備・機能タグ用チップ (日本語ラベル向けにゴシック・字間控えめ)。
function FacilityChip({
  label, active, onClick,
}: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 min-h-[34px] inline-flex items-center font-sans text-[11px] border transition ${
        active
          ? "border-accent text-accent bg-[#0e1a20]"
          : "border-line text-muted hover:border-ink hover:text-ink"
      }`}
    >
      {label}
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
  const en = useLocale() === "en";
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
              emptyLabel={en ? "Min — any" : "下限なし"}
              className={`flex-1 ${invalid ? "border-accent text-accent" : ""}`}
            />
            <span className="mono text-[12px] opacity-50">{en ? "–" : "〜"}</span>
          </>
        )}
        <ChoiceSelect
          value={max}
          onChange={setMax}
          options={options}
          format={format}
          emptyLabel={singleMax ? (en ? "No limit" : "制限なし") : en ? "Max — any" : "上限なし"}
          className={`flex-1 ${invalid ? "border-accent text-accent" : ""}`}
        />
      </div>
      {invalid && (
        <div className="mono text-[10px] text-accent mt-1">
          {en
            ? "※ Min > Max — this filter is disabled"
            : "※ 下限 > 上限 — このフィルタは無効化されています"}
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
      <option value="" className="bg-neutral-300 text-black">{emptyLabel}</option>
      {options.map((o) => (
        <option key={String(o)} value={String(o)} className="bg-neutral-300 text-black">
          {format ? format(o) : String(o)}
        </option>
      ))}
    </select>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ComboPicker — text input + datalist (substring match in filter logic)
// ──────────────────────────────────────────────────────────────────────────

function ComboPicker({
  value, onChange, options, placeholder,
}: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  const id = useId();
  const displayValue = value === "all" ? "" : value;
  return (
    <>
      <input
        type="text"
        list={id}
        value={displayValue}
        onChange={(e) => onChange(e.target.value.trim() === "" ? "all" : e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} w-full`}
      />
      <datalist id={id}>
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
  const en = useLocale() === "en";
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
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=jp&q=${encodeURIComponent(t)}`,
          { headers: { Accept: "application/json" } },
        );
        const j: GeocodeHit[] = await r.json();
        if (id === lastReq.current) setResults(j);
      } catch {
        if (id === lastReq.current) setError(en ? "Search failed" : "検索に失敗");
      } finally {
        if (id === lastReq.current) setResolving(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, value.label, en]);

  const commit = useCallback((next: Reference) => {
    onChange(next); setQuery(next.label); setOpen(false); setResults([]);
  }, [onChange]);

  const tryResolve = useCallback(() => {
    const t = query.trim();
    if (!t) return;
    const preset = REFERENCE_PRESETS.find((r) => r.label === t || r.labelEn === t || r.id === t);
    if (preset) {
      commit({ id: preset.id, lat: preset.lat, lng: preset.lng, label: en ? preset.labelEn : preset.label });
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
          placeholder={en ? "Shibuya Sta. / Osaka Sta. / 35.66, 139.70 / ..." : "渋谷駅 / 大阪駅 / 35.66, 139.70 / ..."}
          className={`${inputCls} flex-1 min-w-0`}
        />
        <button
          type="button"
          onClick={onUseGeolocation}
          className="mono text-[10px] tracking-[0.2em] uppercase border border-line bg-bg px-2 hover:border-accent hover:text-accent transition"
          title={en ? "Current location" : "現在地"}
        >
          📍
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {REFERENCE_PRESETS.map((pr) => {
          const lbl = en ? pr.labelEn : pr.label;
          return (
            <button
              key={pr.id}
              type="button"
              onClick={() => commit({ id: pr.id, lat: pr.lat, lng: pr.lng, label: lbl })}
              className={`mono text-[9px] tracking-[0.16em] uppercase px-1.5 py-0.5 border transition ${
                value.id === pr.id
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {lbl}
            </button>
          );
        })}
      </div>
      {open && (results.length > 0 || resolving || error) && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 border border-line bg-bg shadow-2xl max-h-[260px] overflow-auto">
          {resolving && <div className="px-3 py-2 mono text-[10px] text-muted">{en ? "Searching…" : "検索中…"}</div>}
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

const SORT_COLS: Array<{
  label: string; labelEn: string;
  ascKey: SortKey; descKey: SortKey;
  ascLabel: string; descLabel: string;
  ascLabelEn: string; descLabelEn: string;
}> = [
  { label: "新着順",   labelEn: "Date",     ascKey: "newest",       descKey: "oldest",       ascLabel: "新", descLabel: "古", ascLabelEn: "New",  descLabelEn: "Old" },
  { label: "時間料金", labelEn: "Hourly",   ascKey: "priceAsc",     descKey: "priceDesc",    ascLabel: "安", descLabel: "高", ascLabelEn: "Low",  descLabelEn: "High" },
  { label: "日料金",   labelEn: "Daily",    ascKey: "dailyAsc",     descKey: "dailyDesc",    ascLabel: "安", descLabel: "高", ascLabelEn: "Low",  descLabelEn: "High" },
  { label: "天井",     labelEn: "Ceiling",  ascKey: "ceilingDesc",  descKey: "ceilingAsc",   ascLabel: "高", descLabel: "低", ascLabelEn: "High", descLabelEn: "Low" },
  { label: "距離",     labelEn: "Distance", ascKey: "distanceAsc",  descKey: "distanceDesc", ascLabel: "近", descLabel: "遠", ascLabelEn: "Near", descLabelEn: "Far" },
];

function SortBar({
  sort, setSort, resultCount, totalCount,
}: {
  sort: SortKey; setSort: (v: SortKey) => void;
  resultCount: number; totalCount: number;
}) {
  const en = useLocale() === "en";
  return (
    <div className="mt-4 border border-line bg-[#222] px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] mono">
      <div className="flex items-baseline gap-2 font-sans">
        <span className="brand text-2xl text-accent">{resultCount.toLocaleString(en ? "en-US" : "ja-JP")}</span>
        <span className="text-[12px] font-medium opacity-70">{en ? "results" : "件"}</span>
        <span className="text-[12px] opacity-50">/ {totalCount} {en ? "total" : "全"}</span>
      </div>

      <div className="flex flex-wrap items-stretch gap-x-3 gap-y-1 ml-auto">
        {SORT_COLS.map((c) => (
          <div key={c.label} className="flex flex-col items-center">
            <div className="mono text-[9px] tracking-[0.22em] uppercase opacity-50">
              {en ? c.labelEn : c.label}
            </div>
            <div className="flex">
              <button
                type="button"
                onClick={() => setSort(c.ascKey)}
                className={`px-2 py-1 mono text-[10px] tracking-[0.18em] uppercase transition ${
                  sort === c.ascKey
                    ? "bg-accent text-bg"
                    : "text-muted hover:text-accent"
                }`}
              >
                {en ? c.ascLabelEn : c.ascLabel}
              </button>
              <span className="mono text-[10px] opacity-30 px-0.5">|</span>
              <button
                type="button"
                onClick={() => setSort(c.descKey)}
                className={`px-2 py-1 mono text-[10px] tracking-[0.18em] uppercase transition ${
                  sort === c.descKey
                    ? "bg-accent text-bg"
                    : "text-muted hover:text-accent"
                }`}
              >
                {en ? c.descLabelEn : c.descLabel}
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
  property, distanceKm, referenceLabel, highlighted, bookmarked = false, signedIn = false, reviewStat,
}: {
  property: Property; distanceKm: number | null;
  referenceLabel: string; highlighted: boolean;
  bookmarked?: boolean; signedIn?: boolean;
  reviewStat?: { average: number; count: number };
}) {
  const en = useLocale() === "en";
  const lc = en ? "en" : "ja";
  const yen = property.hourlyPrice.toLocaleString(en ? "en-US" : "ja-JP");
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
            {property.studioType ? ` · ${property.studioType}` : ""}
          </div>
        </div>
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
            revalidate="/properties"
            variant="overlay"
          />
        </div>
      </div>

      <div className="p-4 space-y-3 flex flex-col flex-1">
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted">
          {property.prefecture} / {property.city}
        </div>
        <h3 className="serif text-[1.05rem] leading-[1.45] line-clamp-2 min-h-[3.05rem]">
          {property.title}
        </h3>
        {reviewStat && reviewStat.count > 0 && (
          <div className="flex items-center gap-1 -mt-1.5 text-accent">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
              <path d="M12 2.5l2.95 6.32 6.8.72-5.05 4.75 1.4 6.86L12 17.6l-6.1 3.55 1.4-6.86L2.25 9.54l6.8-.72L12 2.5z" />
            </svg>
            <span className="mono text-[11px] font-bold">{reviewStat.average.toFixed(1)}</span>
            <span className="mono text-[10px] text-muted">({reviewStat.count})</span>
          </div>
        )}
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
