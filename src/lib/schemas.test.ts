import { describe, it, expect } from "vitest";
import { localizeProperty, propertySchema } from "./schemas";

function makeProperty(overrides: Record<string, unknown> = {}) {
  return propertySchema.parse({
    id: "test-prop",
    category: "studio",
    address: "東京都渋谷区渋谷2-1-1",
    nearestStation: "渋谷駅 徒歩5分",
    availableHours: "24時間可（要相談）",
    permitType: "道路使用許可",
    permitNotes: "所轄警察署への事前申請が必要です。",
    cover: { src: "/x.jpg", alt: "スタジオ外観" },
    gallery: [{ src: "/y.jpg", alt: "内観写真" }],
    ...overrides,
  });
}

describe("localizeProperty", () => {
  it("leaves fields untouched for non-en locales", () => {
    const p = makeProperty();
    const out = localizeProperty(p, "ja");
    expect(out.address).toBe("東京都渋谷区渋谷2-1-1");
    expect(out.cover.alt).toBe("スタジオ外観");
  });

  it("falls back to Japanese when EN fields are empty", () => {
    const p = makeProperty();
    const out = localizeProperty(p, "en");
    expect(out.address).toBe("東京都渋谷区渋谷2-1-1");
    expect(out.nearestStation).toBe("渋谷駅 徒歩5分");
    expect(out.availableHours).toBe("24時間可（要相談）");
    expect(out.permitType).toBe("道路使用許可");
    expect(out.permitNotes).toBe("所轄警察署への事前申請が必要です。");
    expect(out.cover.alt).toBe("スタジオ外観");
    expect(out.gallery[0].alt).toBe("内観写真");
  });

  it("prefers EN fields when present", () => {
    const p = makeProperty({
      addressEn: "2-1-1 Shibuya, Shibuya-ku, Tokyo",
      nearestStationEn: "Shibuya Sta., 5 min walk",
      availableHoursEn: "Available 24h (by arrangement)",
      permitTypeEn: "Road-use permit",
      permitNotesEn: "Advance application to the local police station is required.",
      cover: { src: "/x.jpg", alt: "スタジオ外観", altEn: "Studio exterior" },
      gallery: [{ src: "/y.jpg", alt: "内観写真", altEn: "Interior photo" }],
    });
    const out = localizeProperty(p, "en");
    expect(out.address).toBe("2-1-1 Shibuya, Shibuya-ku, Tokyo");
    expect(out.nearestStation).toBe("Shibuya Sta., 5 min walk");
    expect(out.availableHours).toBe("Available 24h (by arrangement)");
    expect(out.permitType).toBe("Road-use permit");
    expect(out.permitNotes).toBe(
      "Advance application to the local police station is required.",
    );
    expect(out.cover.alt).toBe("Studio exterior");
    expect(out.gallery[0].alt).toBe("Interior photo");
  });
});
