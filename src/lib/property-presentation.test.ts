import { expect, it } from "vitest";
import { googleMapsEmbedUrl, googleMapsUrl, publicPropertyEmail, propertyTitleSegments } from "./property-presentation";

it("keeps the crossing name in word-sized chunks without losing original title text", () => {
  const title = "渋谷スクランブル交差点";
  const parts = propertyTitleSegments(title);
  expect(parts.join("")).toBe(title);
  expect(parts).toContain("交差点");
  expect(parts).not.toContain("点");
});
it("preserves explicit line breaks and generic titles", () => {
  const title = "Warehouse A\nVeryLongUnbrokenPropertyTitle";
  expect(propertyTitleSegments(title).join("")).toBe(title);
});
it("removes only Shibuya's public email presentation, not another listing's email", () => {
  expect(publicPropertyEmail("shibuyasq", "owner@example.test")).toBe("");
  expect(publicPropertyEmail("studio", "studio@example.test")).toBe("studio@example.test");
});
it("builds Google Maps from real coordinates, with address as fallback only", () => {
  expect(googleMapsUrl({ lat: 35.659, lng: 139.7 }, "")).toBe("https://www.google.com/maps/search/?api=1&query=35.659%2C139.7");
  expect(googleMapsUrl({ lat: 35.659, lng: 139.7 }, "東京都渋谷区", "有明\n教育芸術大学")).toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("有明 教育芸術大学 東京都渋谷区"));
  expect(googleMapsEmbedUrl(null, "東京都渋谷区", "スタジオA")).toBe("https://www.google.com/maps?q=" + encodeURIComponent("スタジオA 東京都渋谷区") + "&output=embed");
  expect(googleMapsUrl(null, "東京都渋谷区")).toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("東京都渋谷区"));
  expect(googleMapsUrl(null, "")).toBe("");
});

import { usageEstimates } from "./property-presentation";
it("builds usage estimates from the hourly rate, honouring the minimum hours and a daily rate", () => {
  const rows = usageEstimates({ priceType: "hourly", hourlyPrice: 6600, minUsageHours: 2, dailyPrice: 0 });
  expect(rows.map((r) => [r.hours, r.total])).toEqual([[3, 19800], [5, 33000], [9, 59400]]);
  expect(usageEstimates({ priceType: "hourly", hourlyPrice: 6600, minUsageHours: 4, dailyPrice: 0 })[0]).toMatchObject({ hours: 4, total: 26400 });
  expect(usageEstimates({ priceType: "hourly", hourlyPrice: 6600, minUsageHours: 0, dailyPrice: 45000 })[2]).toMatchObject({ total: 45000, daily: true });
});
it("has no estimates without an hourly price or for flat/free pricing", () => {
  expect(usageEstimates({ priceType: "hourly", hourlyPrice: 0, minUsageHours: 0, dailyPrice: 0 })).toEqual([]);
  expect(usageEstimates({ priceType: "flat", hourlyPrice: 30000, minUsageHours: 0, dailyPrice: 0 })).toEqual([]);
  expect(usageEstimates({ priceType: "free", hourlyPrice: 0, minUsageHours: 0, dailyPrice: 0 })).toEqual([]);
});
