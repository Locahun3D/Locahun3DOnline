import { describe, expect, it } from "vitest";
import { propertySchema } from "./schemas";
import { clampToSchema } from "./property-translate-core";

/**
 * 自動英訳が欄の上限を超えると、レコード全体がスキーマ検証に落ち、物件一覧から消える
 * （2026-09-23 ビュースタジオ水道橋: amenityNotesEn.loadingDock が91字 / 上限80）。
 * 長すぎる英語だけを切って、残りはそのまま通すことを確かめる。
 */
describe("clampToSchema", () => {
  const base = propertySchema.parse({ id: "x", category: "studio", cover: {} });

  it("leaves a valid property untouched", () => {
    const { property, trimmed } = clampToSchema(base);
    expect(trimmed).toEqual([]);
    expect(property).toEqual(base);
  });

  it("cuts an over-long English amenity note and keeps the record valid", () => {
    const long =
      "5th floor; luggage acceptance and shipping available the day before (550 yen each, including tax)";
    expect(long.length).toBeGreaterThan(80);
    const broken = {
      ...base,
      amenityNotes: { ...base.amenityNotes, loadingDock: "ビル5階・前日荷受けあり" },
      amenityNotesEn: { ...base.amenityNotesEn, loadingDock: long },
    } as typeof base;
    expect(propertySchema.safeParse(broken).success).toBe(false);

    const { property, trimmed } = clampToSchema(broken);
    expect(trimmed).toContain("amenityNotesEn.loadingDock");
    expect(property.amenityNotesEn.loadingDock.length).toBeLessThanOrEqual(80);
    // 日本語（人が書いた欄）は触らない。
    expect(property.amenityNotes.loadingDock).toBe("ビル5階・前日荷受けあり");
    expect(propertySchema.safeParse(property).success).toBe(true);
  });

  it("cuts at a word boundary when one is close enough to the limit", () => {
    const long = "a".repeat(70) + " " + "b".repeat(30);
    const broken = {
      ...base,
      amenityNotes: { ...base.amenityNotes, parking: "駐車場あり" },
      amenityNotesEn: { ...base.amenityNotesEn, parking: long },
    } as typeof base;
    const { property } = clampToSchema(broken);
    expect(property.amenityNotesEn.parking).toBe("a".repeat(70));
  });
});
