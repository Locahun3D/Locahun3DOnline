import "server-only";
import type { Property } from "./schemas";
import { translateProperty } from "./ai-translate";

/**
 * 物件の自由記述フィールドで「日本語はあるが英語(EN欄)が空」のものを検出する。
 * バルク翻訳で既訳をスキップする判定に使う。
 */
export function needsEnglish(p: Property): boolean {
  if (p.title.trim() && !p.titleEn.trim()) return true;
  if (p.summary.trim() && !p.summaryEn.trim()) return true;
  if (p.description.trim() && !p.descriptionEn.trim()) return true;
  if (p.city.trim() && !p.cityEn.trim()) return true;
  if (p.address.trim() && !p.addressEn.trim()) return true;
  if (p.nearestStation.trim() && !p.nearestStationEn.trim()) return true;
  if (p.availableHours.trim() && !p.availableHoursEn.trim()) return true;
  if (p.permitType.trim() && !p.permitTypeEn.trim()) return true;
  if (p.permitNotes.trim() && !p.permitNotesEn.trim()) return true;
  if (p.cover.alt.trim() && !p.cover.altEn.trim()) return true;
  if (p.gallery.some((g) => g.alt.trim() && !g.altEn.trim())) return true;
  return p.splatItems.some(
    (it) =>
      (it.label.trim() && !it.labelEn.trim()) ||
      (it.saleDescription.trim() && !it.saleDescriptionEn.trim()),
  );
}

/**
 * 空の EN 欄だけを自動翻訳で埋めた新しい Property を返す。
 * - 既に手動で埋めた EN 欄は温存する（`existing || translated`）。
 * - ANTHROPIC_API_KEY 未設定・API 失敗時は翻訳結果が空になり、元のまま返る
 *   （＝日本語表示にフォールバック）。副作用なし・例外を投げない。
 */
export async function fillPropertyEnglish(p: Property): Promise<Property> {
  if (!needsEnglish(p)) return p;

  // 空の EN 欄に対応する日本語だけを翻訳対象に渡す（既訳は "" にして温存）。
  const sceneLabels = p.splatItems.map((it) => (it.labelEn.trim() ? "" : it.label));
  const saleDescriptions = p.splatItems.map((it) =>
    it.saleDescriptionEn.trim() ? "" : it.saleDescription,
  );
  const galleryAlts = p.gallery.map((g) => (g.altEn.trim() ? "" : g.alt));

  const r = await translateProperty({
    title: p.titleEn.trim() ? "" : p.title,
    summary: p.summaryEn.trim() ? "" : p.summary,
    description: p.descriptionEn.trim() ? "" : p.description,
    city: p.cityEn.trim() ? "" : p.city,
    address: p.addressEn.trim() ? "" : p.address,
    nearestStation: p.nearestStationEn.trim() ? "" : p.nearestStation,
    availableHours: p.availableHoursEn.trim() ? "" : p.availableHours,
    permitType: p.permitTypeEn.trim() ? "" : p.permitType,
    permitNotes: p.permitNotesEn.trim() ? "" : p.permitNotes,
    coverAlt: p.cover.altEn.trim() ? "" : p.cover.alt,
    sceneLabels,
    saleDescriptions,
    galleryAlts,
  });

  if (r.source === "none") return p;

  return {
    ...p,
    titleEn: p.titleEn || r.titleEn,
    summaryEn: p.summaryEn || r.summaryEn,
    descriptionEn: p.descriptionEn || r.descriptionEn,
    cityEn: p.cityEn || r.cityEn,
    addressEn: p.addressEn || r.addressEn,
    nearestStationEn: p.nearestStationEn || r.nearestStationEn,
    availableHoursEn: p.availableHoursEn || r.availableHoursEn,
    permitTypeEn: p.permitTypeEn || r.permitTypeEn,
    permitNotesEn: p.permitNotesEn || r.permitNotesEn,
    cover: { ...p.cover, altEn: p.cover.altEn || r.coverAltEn },
    gallery: p.gallery.map((g, i) => ({
      ...g,
      altEn: g.altEn || (r.galleryAltsEn[i] ?? ""),
    })),
    splatItems: p.splatItems.map((it, i) => ({
      ...it,
      labelEn: it.labelEn || (r.sceneLabelsEn[i] ?? ""),
      saleDescriptionEn: it.saleDescriptionEn || (r.saleDescriptionsEn[i] ?? ""),
    })),
  };
}
