import { describe, it, expect } from "vitest";
import { propertySchema, localizeProperty, type Property } from "./schemas";
import { missingEnglishFields } from "./property-english";

/**
 * 設備の1行メモと図面ラベルの英語（2026-09-21 追加）。
 * 公開申請の翻訳必須ガードと EN ページの表示が、同じ判定を使っていることを確かめる。
 */
const base = (over: Partial<Property> = {}): Property =>
  propertySchema.parse({ id: "p", status: "draft", category: "studio", cover: { src: "/api/r2/c.jpg", alt: "", altEn: "", width: 1600, height: 1067 }, title: "スタジオ", titleEn: "Studio", ...over });

describe("設備メモ・図面ラベルの英語", () => {
  it("日本語だけの欄を未翻訳として数える（英語が入っているものは数えない）", () => {
    const p = base({
      amenityNotes: { parking: "3台まで", restroom: "男女共用", elevator: "", loadingDock: "", soundproofing: "", hasInternet: "", airConditioning: "", greenRoom: "", smokingArea: "", fireAllowed: "" },
      amenityNotesEn: { parking: "", restroom: "Unisex", elevator: "", loadingDock: "", soundproofing: "", hasInternet: "", airConditioning: "", greenRoom: "", smokingArea: "", fireAllowed: "" },
      blueprints: [
        { label: "1F 平面図", labelEn: "", url: "/api/r2/a.png" },
        { label: "断面図", labelEn: "Section", url: "/api/r2/b.png" },
      ],
    });
    expect(missingEnglishFields(p)).toEqual(["設備のメモ（1件）", "図面のラベル（1件）"]);
  });

  it("英語が揃っていれば未翻訳は出ない", () => {
    const p = base({
      amenityNotes: { parking: "3台まで", restroom: "", elevator: "", loadingDock: "", soundproofing: "", hasInternet: "", airConditioning: "", greenRoom: "", smokingArea: "", fireAllowed: "" },
      amenityNotesEn: { parking: "Up to 3 cars", restroom: "", elevator: "", loadingDock: "", soundproofing: "", hasInternet: "", airConditioning: "", greenRoom: "", smokingArea: "", fireAllowed: "" },
      blueprints: [{ label: "1F 平面図", labelEn: "1F floor plan", url: "/api/r2/a.png" }],
    });
    expect(missingEnglishFields(p)).toEqual([]);
  });

  it("EN ページでは英語に差し替え、空欄は日本語のまま出す", () => {
    const p = base({
      amenityNotes: { parking: "3台まで", restroom: "男女共用", elevator: "", loadingDock: "", soundproofing: "", hasInternet: "", airConditioning: "", greenRoom: "", smokingArea: "", fireAllowed: "" },
      amenityNotesEn: { parking: "Up to 3 cars", restroom: "", elevator: "", loadingDock: "", soundproofing: "", hasInternet: "", airConditioning: "", greenRoom: "", smokingArea: "", fireAllowed: "" },
      blueprints: [
        { label: "1F 平面図", labelEn: "1F floor plan", url: "/api/r2/a.png" },
        { label: "断面図", labelEn: "", url: "/api/r2/b.png" },
      ],
    });
    const en = localizeProperty(p, "en");
    expect(en.amenityNotes.parking).toBe("Up to 3 cars");
    expect(en.amenityNotes.restroom).toBe("男女共用");
    expect(en.blueprints.map((b) => b.label)).toEqual(["1F floor plan", "断面図"]);
    // 日本語ページは何も変えない。
    expect(localizeProperty(p, "ja").amenityNotes.parking).toBe("3台まで");
  });
});
