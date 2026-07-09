import { cache } from "react";
import { repo } from "./store";
import { getCurrentUser } from "./dal";
import { canViewConfidential } from "./account-schema";
import { haversineKm } from "./distance";
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

/**
 * 「類似スタジオ」の関連度スコア。カテゴリ一致を最重視し、エリア・スタジオ
 * 種類・タグの共有・座標の近さ・時間料金の近さで加点する。単に「他の公開
 * 物件を先頭からN件」だとカテゴリも場所も無関係なものが並んでしまうため、
 * 実際に関連が薄いものはスコア0のまま除外する（0点フォールバックはしない）。
 */
function relatedScore(base: Property, candidate: Property): number {
  let score = 0;
  if (candidate.category === base.category) score += 40;
  if (base.area && candidate.area === base.area) score += 20;
  if (base.studioType && candidate.studioType === base.studioType) score += 15;
  if (base.prefecture && candidate.prefecture === base.prefecture) score += 8;
  if (base.city && candidate.city === base.city) score += 8;

  const baseTags = new Set(base.tags);
  const sharedTags = candidate.tags.filter((t) => baseTags.has(t)).length;
  score += Math.min(sharedTags, 4) * 5;

  // 座標が近いほど加点（渋谷横丁・北谷公園・スクランブル交差点のように
  // 同エリアの別ロケーションを「近くの候補」として拾える）。
  if (base.coords && candidate.coords) {
    const km = haversineKm(base.coords, candidate.coords);
    if (km < 3) score += 25;
    else if (km < 15) score += 15;
    else if (km < 50) score += 5;
  }

  if (base.hourlyPrice > 0 && candidate.hourlyPrice > 0) {
    const ratio = candidate.hourlyPrice / base.hourlyPrice;
    if (ratio >= 0.5 && ratio <= 2) score += 10;
  }

  return score;
}

/**
 * 実際に関連度の高い物件だけを上位から返す（スコア0＝無関係は除外）。
 * 該当が少なければ結果は limit 未満で返る（無関係な物件で無理に埋めない）。
 */
export function findRelatedProperties(
  base: Property,
  all: Property[],
  limit = 3,
): Property[] {
  return all
    .filter((p) => p.id !== base.id)
    .map((p) => ({ p, score: relatedScore(base, p) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.p.updatedAt ?? "").localeCompare(a.p.updatedAt ?? ""),
    )
    .slice(0, limit)
    .map(({ p }) => p);
}
