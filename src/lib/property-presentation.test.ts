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

import { simulatePrice } from "./property-presentation";
const night = { label: "夜間", percent: 20, fromHour: 20, toHour: 8, holidays: false };
const weekend = { label: "土日祝", percent: 20, fromHour: 0, toHour: 0, holidays: true };
it("charges the surcharge only for the hours inside the time window, wrapping past midnight", () => {
  // 18:00 から 4時間 = 18,19 は通常、20,21 は夜間 +20%
  const r = simulatePrice({ hourlyPrice: 10000, startHour: 18, hours: 4, holiday: false, surcharges: [night] });
  expect(r.total).toBe(10000 * 2 + 12000 * 2);
  expect(r.lines).toEqual([{ label: "通常", hours: 2, rate: 10000 }, { label: "夜間", hours: 2, rate: 12000 }]);
  // 6:00 から 3時間 = 6,7 が夜間、8 は通常
  expect(simulatePrice({ hourlyPrice: 10000, startHour: 6, hours: 3, holiday: false, surcharges: [night] }).total).toBe(12000 * 2 + 10000);
});
it("applies the holiday surcharge to every hour and never stacks two surcharges", () => {
  const r = simulatePrice({ hourlyPrice: 10000, startHour: 19, hours: 2, holiday: true, surcharges: [night, weekend] });
  expect(r.total).toBe(12000 * 2);           // 20%+20% ではなく高い方だけ
  expect(simulatePrice({ hourlyPrice: 10000, startHour: 10, hours: 2, holiday: false, surcharges: [weekend] }).total).toBe(20000);
});
it("rounds each surcharged hourly rate to whole yen and handles no surcharges", () => {
  expect(simulatePrice({ hourlyPrice: 16500, startHour: 21, hours: 1, holiday: false, surcharges: [night] }).total).toBe(19800);
  expect(simulatePrice({ hourlyPrice: 6600, startHour: 9, hours: 4, holiday: false, surcharges: [] })).toEqual({ total: 26400, lines: [{ label: "通常", hours: 4, rate: 6600 }] });
});

import { propertyTitleLines } from "./property-presentation";
it("splits a title into the studio name and meaningful lines", () => {
  expect(propertyTitleLines("Studio Union｜世田谷若林 自然光ハウススタジオ")).toEqual({ name: "Studio Union", lines: ["世田谷若林", "自然光ハウススタジオ"] });
  expect(propertyTitleLines("STUDIO MONTFORT | 雑司ヶ谷 自然光の白いスタジオ")).toEqual({ name: "STUDIO MONTFORT", lines: ["雑司ヶ谷", "自然光の白いスタジオ"] });
  expect(propertyTitleLines("PLEASE GREEN｜三軒茶屋　グリーンルームハウススタジオ").lines).toEqual(["三軒茶屋", "グリーンルームハウススタジオ"]);
});
it("keeps titles without a separator on one line and honours explicit newlines", () => {
  expect(propertyTitleLines("渋谷スクランブル交差点")).toEqual({ name: "渋谷スクランブル交差点", lines: [] });
  expect(propertyTitleLines("新宿西口 思い出横丁")).toEqual({ name: "新宿西口 思い出横丁", lines: [] });
  expect(propertyTitleLines("Warehouse A\n横浜の倉庫")).toEqual({ name: "Warehouse A", lines: ["横浜の倉庫"] });
  expect(propertyTitleLines("")).toEqual({ name: "", lines: [] });
});
