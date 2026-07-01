import { cache } from "react";
import { repo } from "./store";
import { getCurrentUser } from "./dal";
import { canViewConfidential } from "./account-schema";
import type { Property, PropertyCategory } from "./schemas";

export type {
  Property,
  PropertyImage,
  PropertyCategory,
  PropertyStatus,
} from "./schemas";

export { CATEGORY_LABEL, STATUS_LABEL } from "./schemas";

/**
 * Resolve the viewer, but tolerate non-request contexts (e.g.
 * `generateStaticParams` at build time) where Clerk's `auth()` is unavailable
 * — there we treat the viewer as anonymous.
 */
async function currentUserSafe() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

/**
 * Drop confidential (NDA-only) listings unless the current viewer is allowed
 * to see them (admin, or an NDA-signed production account).
 */
async function filterVisible(list: Property[]): Promise<Property[]> {
  const user = await currentUserSafe();
  if (canViewConfidential(user)) return list;
  return list.filter((p) => p.visibility !== "confidential");
}

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

export const getPublishedProperties = cache(async (): Promise<Property[]> => {
  return filterVisible(await repo.list({ status: "published" }));
});

/**
 * Build-safe list of published property IDs for `generateStaticParams`.
 * Must NOT touch Clerk `auth()` (no request context at build time), so it
 * skips viewer-based visibility filtering — confidential pages are still
 * access-gated at request time by `getPublishedProperty`.
 */
export async function getPublishedPropertyIds(): Promise<string[]> {
  const all = await repo.list({ status: "published" });
  return all.map((p) => p.id);
}

export async function getAllAreas(): Promise<string[]> {
  const all = await getPublishedProperties();
  return Array.from(new Set(all.map((p) => p.area))).sort();
}

export const getPublishedProperty = cache(async (
  id: string,
): Promise<Property | null> => {
  const p = await repo.get(id);
  if (!p || p.status !== "published") return null;
  if (p.visibility === "confidential") {
    const user = await currentUserSafe();
    if (!canViewConfidential(user)) return null;
  }
  return p;
});
