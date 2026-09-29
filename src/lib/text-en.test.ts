import { describe, expect, it } from "vitest";
import { localizeProperty, propertySchema, textEnSources } from "./schemas";
import { missingEnglishFields } from "./property-english";
import { fillPropertyEnglishUsing } from "./property-translate-core";
import type { TranslateInput, TranslateResult } from "./ai-translate-core";

/**
 * 個別の英語欄が無い自由記述（料金の補足・キャンセル規定・電源・タグなど）の英訳（2026-09-29）。
 * 以前は英語ページにこれらが日本語のまま出ていた（スタジオNOW の料金表、PLEASE GREEN のタグなど）。
 */
const base = propertySchema.parse({
  id: "x",
  category: "studio",
  cover: {},
  studioType: "ハウススタジオ",
  extraFees: "3時間パック：平日5,000円",
  powerVoltage: "100V 60A",
  tags: ["自然光", "三軒茶屋"],
});

function fakeTranslate(seen: TranslateInput[]) {
  return async (input: TranslateInput): Promise<TranslateResult> => {
    seen.push(input);
    const textsEn = Object.fromEntries(Object.entries(input.texts ?? {}).map(([k, v]) => [k, `EN(${v})`]));
    return {
      titleEn: "", summaryEn: "", descriptionEn: "", cityEn: "", addressEn: "", nearestStationEn: "",
      availableHoursEn: "", permitTypeEn: "", permitNotesEn: "", coverAltEn: "",
      sceneLabelsEn: [], saleDescriptionsEn: [], galleryAltsEn: [], amenityNotesEn: [], blueprintLabelsEn: [],
      textsEn, source: "ai",
    };
  };
}

describe("textEn", () => {
  it("lists only fields and tags the dictionaries cannot translate", () => {
    expect(textEnSources(base).map((s) => s.key)).toEqual(["powerVoltage", "extraFees", "tag:三軒茶屋"]);
  });

  it("counts untranslated free text as missing English", () => {
    expect(missingEnglishFields(base)).toContain("料金・規定・設備などの補足（3件）");
  });

  it("fills the free text and shows it on the English page", async () => {
    const seen: TranslateInput[] = [];
    const { property } = await fillPropertyEnglishUsing(base, fakeTranslate(seen));
    expect(seen[0].texts).toEqual({ powerVoltage: "100V 60A", extraFees: "3時間パック：平日5,000円", "tag:三軒茶屋": "三軒茶屋" });
    expect(missingEnglishFields(property)).toEqual([]);
    const en = localizeProperty(property, "en");
    expect(en.extraFees).toBe("EN(3時間パック：平日5,000円)");
    expect(en.studioType).toBe("House studio");
    expect(en.tags).toEqual(["Natural light", "EN(三軒茶屋)"]);
    expect(localizeProperty(property, "ja").extraFees).toBe("3時間パック：平日5,000円");
  });

  it("drops an old translation once the Japanese is rewritten", async () => {
    const { property } = await fillPropertyEnglishUsing(base, fakeTranslate([]));
    const edited = { ...property, extraFees: "6時間パック：平日7,500円" };
    expect(localizeProperty(edited, "en").extraFees).toBe("6時間パック：平日7,500円");
    expect(missingEnglishFields(edited)).toContain("料金・規定・設備などの補足（1件）");
    const seen: TranslateInput[] = [];
    const { property: again } = await fillPropertyEnglishUsing(edited, fakeTranslate(seen));
    expect(seen[0].texts).toEqual({ extraFees: "6時間パック：平日7,500円" });
    expect(again.textEn.extraFees).toEqual({ ja: "6時間パック：平日7,500円", en: "EN(6時間パック：平日7,500円)" });
  });
});
