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

/**
 * 「類似スタジオ」の関連度スコア。距離・エリア等の地理的近さは見ず、
 * タグの共有とスタジオとしての性質（カテゴリ・スタジオ種類・料金形態・
 * 設備の有無）の類似性だけで判定する。単に「他の公開物件を先頭からN件」
 * だと性質の異なるものが並んでしまうため、無関係なものはスコア0のまま
 * 除外する（0点フォールバックはしない）。
 */
function relatedScore(base: Property, candidate: Property): number {
  let score = 0;
  if (candidate.category === base.category) score += 30;
  if (base.studioType && candidate.studioType === base.studioType) score += 20;
  // 料金形態（時間貸し/撮影許可/無料）はレンタルスタジオか許可制ロケ地かという
  // スタジオ性質そのものの違いを表す。
  if (base.priceType === candidate.priceType) score += 10;

  // タグの共有をもっとも重視する（最大5個・1個+8点）。
  const baseTags = new Set(base.tags);
  const sharedTags = candidate.tags.filter((t) => baseTags.has(t)).length;
  score += Math.min(sharedTags, 5) * 8;

  // 設備の性質が両方とも「ある」場合のみ加点（両方「なし」の一致は
  // スタジオとしての特徴一致とは言えないため対象外）。
  if (base.hasNaturalLight && candidate.hasNaturalLight) score += 4;
  if (base.parking && candidate.parking) score += 4;
  if (base.loadingDock && candidate.loadingDock) score += 4;
  if (base.soundproofing && candidate.soundproofing) score += 4;
  if (base.hasInternet && candidate.hasInternet) score += 4;

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
