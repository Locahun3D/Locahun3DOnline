"use client";

import { CATEGORY_LABEL, type PropertyCategory } from "@/lib/schemas";

interface Defaults {
  category: PropertyCategory | "all";
  area: string;
  q: string;
  maxPrice?: number;
  minCeiling?: number;
}

export default function PropertyFilters({
  defaults,
  areas,
  categories,
}: {
  defaults: Defaults;
  areas: string[];
  categories: PropertyCategory[];
}) {
  return (
    <form
      method="get"
      action="/properties"
      className="grid grid-cols-1 md:grid-cols-6 gap-3 p-5 border border-line bg-[#222]"
    >
      <label className="md:col-span-2 flex flex-col gap-1">
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-50">
          Keyword
        </span>
        <input
          type="search"
          name="q"
          defaultValue={defaults.q}
          placeholder="白ホリ / 倉庫 / 渋谷 ..."
          className="bg-transparent border-b border-line py-2 text-sm focus:outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-50">
          Category
        </span>
        <select
          name="category"
          defaultValue={defaults.category}
          className="bg-transparent border-b border-line py-2 text-sm focus:outline-none focus:border-accent"
        >
          <option value="all" className="bg-bg">すべて</option>
          {categories.map((c) => (
            <option key={c} value={c} className="bg-bg">
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-50">
          Area
        </span>
        <select
          name="area"
          defaultValue={defaults.area}
          className="bg-transparent border-b border-line py-2 text-sm focus:outline-none focus:border-accent"
        >
          <option value="all" className="bg-bg">すべて</option>
          {areas.map((a) => (
            <option key={a} value={a} className="bg-bg">{a}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-50">
          Max ¥/hr
        </span>
        <input
          type="number"
          name="maxPrice"
          defaultValue={defaults.maxPrice ?? ""}
          min={0}
          step={1000}
          placeholder="上限なし"
          className="bg-transparent border-b border-line py-2 text-sm focus:outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-50">
          Min 天井m
        </span>
        <input
          type="number"
          name="minCeiling"
          defaultValue={defaults.minCeiling ?? ""}
          min={0}
          step={0.5}
          placeholder="制限なし"
          className="bg-transparent border-b border-line py-2 text-sm focus:outline-none focus:border-accent"
        />
      </label>

      <div className="md:col-span-6 flex justify-end gap-3 pt-2">
        <a
          href="/properties"
          className="px-4 py-2 mono text-[11px] tracking-[0.22em] uppercase border border-line text-muted hover:border-ink hover:text-ink transition"
        >
          Reset
        </a>
        <button
          type="submit"
          className="px-5 py-2 mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
        >
          絞り込む →
        </button>
      </div>
    </form>
  );
}
