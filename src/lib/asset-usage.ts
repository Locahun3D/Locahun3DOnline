/**
 * PURE: compute which properties reference each asset URL.
 * No server-only import — testable in node env.
 */
import type { Asset, Property } from "./schemas";

/** url → propertyId[] (only urls actually referenced are present). */
export function computeAssetUsage(
  properties: Pick<Property, "id" | "cover" | "gallery" | "splatUrl">[],
  assets: Pick<Asset, "url">[],
): Record<string, string[]> {
  const known = new Set(assets.map((a) => a.url).filter(Boolean));
  const usage: Record<string, string[]> = {};
  const add = (url: string | undefined, pid: string) => {
    if (!url || !known.has(url)) return;
    (usage[url] ??= []).push(pid);
  };
  for (const p of properties) {
    add(p.cover?.src, p.id);
    for (const g of p.gallery ?? []) add(g.src, p.id);
    add(p.splatUrl, p.id);
  }
  return usage;
}
