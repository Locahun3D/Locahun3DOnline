import type { FieldPath } from "react-hook-form";
import type { Property } from "./schemas";

/** Adopt only server-generated EN values the editor has not changed meanwhile. */
export function publishedEnglishUpdates(before: Property, current: Property, saved: Property) {
  const updates: { path: FieldPath<Property>; value: string }[] = [];
  const add = (path: FieldPath<Property>, old: string, live: string, stored: string) => {
    if (live === old && stored !== old) updates.push({ path, value: stored });
  };
  for (const key of ["titleEn", "summaryEn", "descriptionEn", "cityEn", "addressEn", "nearestStationEn", "availableHoursEn", "permitTypeEn", "permitNotesEn"] as const) {
    add(key, before[key], current[key], saved[key]);
  }
  if (current.cover.src === before.cover.src) {
    add("cover.altEn", before.cover.altEn, current.cover.altEn, saved.cover.altEn);
  }
  current.gallery.forEach((image, i) => {
    const sameRow = before.gallery[i];
    if (sameRow && sameRow.src === image.src && sameRow.alt === image.alt && sameRow.altEn === image.altEn) {
      add(`gallery.${i}.altEn`, sameRow.altEn, image.altEn, saved.gallery[i].altEn);
      return;
    }
    // Image rows have no durable ID. Only reconcile an unambiguous source;
    // never put a removed/replaced image's translation on another image.
    const old = before.gallery.filter(g => g.src === image.src && g.alt === image.alt);
    const stored = saved.gallery.filter(g => g.src === image.src && g.alt === image.alt);
    if (old.length === 1 && stored.length === 1) {
      add(`gallery.${i}.altEn`, old[0].altEn, image.altEn, stored[0].altEn);
    }
  });
  current.splatItems.forEach((item, i) => {
    if (!item.id) return;
    const old = before.splatItems.find(s => s.id === item.id);
    const stored = saved.splatItems.find(s => s.id === item.id);
    if (!old || !stored) return;
    add(`splatItems.${i}.labelEn`, old.labelEn, item.labelEn, stored.labelEn);
    add(`splatItems.${i}.saleDescriptionEn`, old.saleDescriptionEn, item.saleDescriptionEn, stored.saleDescriptionEn);
  });
  return updates;
}
