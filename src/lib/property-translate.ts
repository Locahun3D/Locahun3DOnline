import "server-only";
import type { Property } from "./schemas";
import { translateProperty, type TranslateFailure } from "./ai-translate";
import { needsEnglish } from "./property-english";

/**
 * 「日本語はあるが英語(EN欄)が空」の判定。正本は lib/property-english.ts（純関数・
 * client からも使う）へ移した（2026-09-20）。既存の import 元を壊さないよう再エクスポートする。
 */
export { needsEnglish };

/**
 * 空の EN 欄だけを自動翻訳で埋めた新しい Property を返す。
 * - 既に手動で埋めた EN 欄は温存する（`existing || translated`）。
 * - ANTHROPIC_API_KEY 未設定・API 失敗時は翻訳結果が空になり、元のまま返る
 *   （＝日本語表示にフォールバック）。副作用なし・例外を投げない。
 */
export async function fillPropertyEnglish(p: Property): Promise<Property> {
  return (await fillPropertyEnglishWithReport(p)).property;
}

/** 訳した結果と、訳せなかった理由（公開申請の画面に出す。2026-09-23）。 */
export async function fillPropertyEnglishWithReport(
  p: Property,
): Promise<{ property: Property; failure?: TranslateFailure }> {
  if (!needsEnglish(p)) return { property: p };

  // 空の EN 欄に対応する日本語だけを翻訳対象に渡す（既訳は "" にして温存）。
  const sceneLabels = p.splatItems.map((it) => (it.labelEn.trim() ? "" : it.label));
  const saleDescriptions = p.splatItems.map((it) =>
    it.saleDescriptionEn.trim() ? "" : it.saleDescription,
  );
  const galleryAlts = p.gallery.map((g) => (g.altEn.trim() ? "" : g.alt));
  // 設備メモと図面ラベルも同じやり方で（既訳は "" にして温存。2026-09-21）。
  const noteKeys = Object.keys(p.amenityNotes) as (keyof typeof p.amenityNotes)[];
  const amenityNotes = noteKeys.map((k) =>
    (p.amenityNotesEn?.[k] ?? "").trim() ? "" : p.amenityNotes[k],
  );
  const blueprintLabels = p.blueprints.map((b) => (b.labelEn.trim() ? "" : b.label));

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
    amenityNotes,
    blueprintLabels,
  });

  if (r.source === "none") return { property: p, failure: r.failure };

  const property: Property = {
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
    amenityNotesEn: Object.fromEntries(
      noteKeys.map((k, i) => [k, (p.amenityNotesEn?.[k] ?? "") || (r.amenityNotesEn[i] ?? "")]),
    ) as Property["amenityNotesEn"],
    blueprints: p.blueprints.map((b, i) => ({
      ...b,
      labelEn: b.labelEn || (r.blueprintLabelsEn[i] ?? ""),
    })),
  };
  return { property, failure: r.failure };
}
