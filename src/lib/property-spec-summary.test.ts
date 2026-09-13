import { describe, expect, it } from "vitest";
import { propertySchema } from "./schemas";
import { propertySpecSummary } from "./property-spec-summary";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PropertySpecSummary from "../components/property-spec-summary";

const empty = propertySchema.parse({ id: "fixture", title: "Fixture", category: "studio", cover: { src: "/fixture.jpg", alt: "Fixture" } });
describe("registered property specification summary", () => {
  it("keeps missing numeric, blank and default false values unknown", () => {
    const cards = propertySpecSummary(empty, false);
    expect(cards).toEqual([]);
  });
  it("uses actual area, height, room, voltage, internet and parking units", () => {
    const cards = propertySpecSummary({ ...empty, floorAreaSqm: 125.5, ceilingHeightM: 3.7, greenRoom: true, powerVoltage: "100V / 200V", hasInternet: true, parking: true, parkingCapacity: 4 }, false);
    expect(cards.map(c => c.value)).toEqual(["125.5 m²", "3.7 m", "有り", "100V / 200V", "有り", "4 台"]);
    expect(cards.every(c => c.registered)).toBe(true);
    expect(cards.find(c => c.key === "power")?.label).toBe("電気（電圧）");
  });
  it("does not invent internet speed, room count or amperage in English", () => {
    const cards = propertySpecSummary({ ...empty, greenRoom: true, powerVoltage: "200V", hasInternet: true, parking: true }, true);
    expect(cards.map(c => c.value)).toEqual(["Available", "200V", "Available", "Available"]);
    expect(cards.find(c => c.key === "power")?.label).toBe("Power (voltage)");
  });
  it("preserves registered parking capacity even with a default false availability flag", () => {
    expect(propertySpecSummary({ ...empty, parkingCapacity: 2 }, true).at(-1)?.value).toBe("2 spaces");
    expect(propertySpecSummary({ ...empty, parkingCapacity: 1 }, true).at(-1)?.value).toBe("1 space");
    expect(propertySpecSummary({ ...empty, powerVoltage: "  " }, true).find(c => c.key === "power")).toBeUndefined();
  });
  it("shows genuine access information when numeric specifications are absent", () => {
    const p = { ...empty, address: "登録住所", nearestStation: "登録駅 徒歩5分", availableHours: "平日 10:00–18:00" };
    expect(propertySpecSummary(p, false).map(c => [c.key, c.value])).toEqual([["address", "登録住所"], ["station", "登録駅 徒歩5分"], ["hours", "平日 10:00–18:00"]]);
  });
  it("uses registered English text with the established Japanese fallback", () => {
    const p = { ...empty, address: "登録住所", addressEn: "Registered address", nearestStation: "登録駅", nearestStationEn: "Registered station", availableHours: "登録時間", availableHoursEn: "Registered hours" };
    expect(propertySpecSummary(p, true).map(c => c.value)).toEqual(["Registered address", "Registered station", "Registered hours"]);
    expect(propertySpecSummary({ ...p, addressEn: "", nearestStationEn: "", availableHoursEn: "" }, true).map(c => c.value)).toEqual(["登録住所", "登録駅", "登録時間"]);
  });
  it("preserves registered time-range bounds but does not infer incomplete hours", () => {
    expect(propertySpecSummary({ ...empty, customHoursStart: "09:00", customHoursEnd: "17:00" }, true).map(c => c.value)).toEqual(["09:00–17:00"]);
    expect(propertySpecSummary({ ...empty, customHoursStart: "09:00" }, true)).toEqual([]);
  });
  it("shows both explicit hours and the localized registration note", () => {
    const p = { ...empty, customHoursStart: "09:00", customHoursEnd: "17:00", availableHours: "平日のみ", availableHoursEn: "Weekdays only" };
    expect(propertySpecSummary(p, false).find(c => c.key === "hours")?.value).toBe("09:00–17:00 平日のみ");
    expect(propertySpecSummary(p, true).find(c => c.key === "hours")?.value).toBe("09:00–17:00 Weekdays only");
  });
  it("renders one short empty message instead of empty specification cards", () => {
    for (const en of [false, true]) {
      const html = renderToStaticMarkup(createElement(PropertySpecSummary, { property: empty, en }));
      expect(html).not.toContain("data-property-spec=");
      expect(html).toContain(en ? "Property information is not registered." : "物件情報は未登録です。");
    }
  });
});
