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

it("can exclude Saturdays from a Sunday-and-holiday surcharge", () => {
  const sunHol = { label: "日祝", percent: 20, fromHour: 0, toHour: 0, holidays: true, includeSaturday: false };
  const base = { hourlyPrice: 10000, startHour: 10, hours: 2, holiday: false, surcharges: [sunHol] };
  expect(simulatePrice({ ...base, day: "saturday" }).total).toBe(20000);
  expect(simulatePrice({ ...base, day: "sunday" }).total).toBe(24000);
  expect(simulatePrice({ ...base, day: "holiday" }).total).toBe(24000);
  expect(simulatePrice({ ...base, day: "saturday", surcharges: [{ ...sunHol, includeSaturday: true }] }).total).toBe(24000);
});

// 2026-09-20: 料金は必ず選択制（プランが無い物件でも選択肢を合成する）
import { dailyEstimates, priceChoices, simulateDailyPrice } from "./property-presentation";
it("synthesises selectable price choices when a property has no rate plans", () => {
  const base = { priceType: "hourly", hourlyPrice: 18000, minUsageHours: 3, dailyPrice: 120000 };
  expect(priceChoices(base).map((c) => [c.key, c.kind, c.price, c.minHours])).toEqual([["hourly", "hourly", 18000, 3], ["daily", "daily", 120000, 0]]);
  expect(priceChoices({ ...base, dailyPrice: 0 }).map((c) => c.key)).toEqual(["hourly"]);
  expect(priceChoices({ ...base, hourlyPrice: 0 }).map((c) => c.key)).toEqual(["daily"]);
  expect(priceChoices({ ...base, priceType: "flat" })).toEqual([]);
  expect(priceChoices({ ...base, hourlyPrice: 0, dailyPrice: 0 })).toEqual([]);
});
it("keeps rate plans and appends the daily option", () => {
  const plans = [{ label: "スチール", labelEn: "Stills", hourlyPrice: 6600, minHours: 2 }, { label: "ムービー", labelEn: "", hourlyPrice: 11000, minHours: 0 }, { label: "", labelEn: "", hourlyPrice: 5000, minHours: 0 }];
  const c = priceChoices({ priceType: "hourly", hourlyPrice: 6600, minUsageHours: 4, dailyPrice: 80000, ratePlans: plans });
  expect(c.map((x) => x.key)).toEqual(["plan-0", "plan-1", "daily"]);
  expect(c[0]).toMatchObject({ label: "スチール", labelEn: "Stills", minHours: 2, fromPlan: true });
  expect(c[1].minHours).toBe(4);
});
it("daily simulation applies only the holiday surcharge, per day", () => {
  const night = { label: "夜間", percent: 20, fromHour: 20, toHour: 8, holidays: false };
  const sunHol = { label: "日祝", percent: 10, fromHour: 0, toHour: 0, holidays: true, includeSaturday: false };
  expect(simulateDailyPrice({ dailyPrice: 100000, days: ["weekday", "weekday"], surcharges: [night, sunHol] })).toEqual({ total: 200000, lines: [{ label: "通常", hours: 2, rate: 100000 }] });
  const r = simulateDailyPrice({ dailyPrice: 100000, days: ["saturday", "sunday", "holiday"], surcharges: [night, sunHol] });
  expect(r.lines).toEqual([{ label: "通常", hours: 1, rate: 100000 }, { label: "日祝", hours: 2, rate: 110000 }]);
  expect(r.total).toBe(320000);
  expect(dailyEstimates(120000)).toEqual([{ days: 1, total: 120000 }, { days: 2, total: 240000 }, { days: 3, total: 360000 }]);
  expect(dailyEstimates(0)).toEqual([]);
});

// 2026-09-20 追補: 目安の行を選ぶとシミュレーターが連動する
import { applyEstimateRow, matchEstimateRow } from "./property-presentation";
it("selecting an estimate row drives the simulator, and manual hours clear or re-match the row", () => {
  // Studio Montfort 型: 単価1つ・プランなし・日額なし
  const rows = usageEstimates({ priceType: "hourly", hourlyPrice: 6600, minUsageHours: 0, dailyPrice: 0 });
  expect(rows.map(applyEstimateRow)).toEqual([{ kind: "hours", hours: 3 }, { kind: "hours", hours: 5 }, { kind: "hours", hours: 9 }]);
  expect(matchEstimateRow(rows, 3)).toBe("still-small");
  expect(matchEstimateRow(rows, 9)).toBe("movie-day");
  expect(matchEstimateRow(rows, 4)).toBeNull();
  // 日額のある物件: 1日の行は「1日貸し」への切り替えで、時間では一致しない
  const withDaily = usageEstimates({ priceType: "hourly", hourlyPrice: 6600, minUsageHours: 0, dailyPrice: 45000 });
  expect(applyEstimateRow(withDaily[2])).toEqual({ kind: "day" });
  expect(matchEstimateRow(withDaily, 9)).toBeNull();
  // 最低5時間で上2行が同じ5時間になる時は、直前に選んだ行を優先
  const min5 = usageEstimates({ priceType: "hourly", hourlyPrice: 6600, minUsageHours: 5, dailyPrice: 0 });
  expect(matchEstimateRow(min5, 5)).toBe("still-small");
  expect(matchEstimateRow(min5, 5, "still-half")).toBe("still-half");
  expect(matchEstimateRow(min5, 5, "movie-day")).toBe("still-small");
});
