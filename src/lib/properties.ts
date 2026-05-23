import { repo } from "./store";
import type { Property, PropertyCategory } from "./schemas";

export type {
  Property,
  PropertyImage,
  PropertyCategory,
  PropertyStatus,
} from "./schemas";

export { CATEGORY_LABEL, STATUS_LABEL } from "./schemas";

export interface PropertyFilters {
  q?: string;
  category?: PropertyCategory | "all";
  area?: string;
  maxPrice?: number;
  minCeiling?: number;
}

export function filterProperties(
  list: Property[],
  f: PropertyFilters,
): Property[] {
  return list.filter((p) => {
    if (f.category && f.category !== "all" && p.category !== f.category) {
      return false;
    }
    if (f.area && f.area !== "all" && p.area !== f.area) return false;
    if (typeof f.maxPrice === "number" && p.hourlyPrice > f.maxPrice) {
      return false;
    }
    if (typeof f.minCeiling === "number" && p.ceilingHeightM < f.minCeiling) {
      return false;
    }
    if (f.q) {
      const q = f.q.toLowerCase();
      const haystack =
        `${p.title} ${p.summary} ${p.city} ${p.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export async function getPublishedProperties(): Promise<Property[]> {
  return repo.list({ status: "published" });
}

export async function getAllAreas(): Promise<string[]> {
  const all = await repo.list({ status: "published" });
  return Array.from(new Set(all.map((p) => p.area))).sort();
}

export async function getPublishedProperty(
  id: string,
): Promise<Property | null> {
  const p = await repo.get(id);
  if (!p || p.status !== "published") return null;
  return p;
}
