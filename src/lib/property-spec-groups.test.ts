import { describe, expect, it } from "vitest";
import { propertySchema } from "./schemas";
import { propertySpecGroups } from "./property-spec-groups";

const empty = propertySchema.parse({ id: "fixture", title: "Fixture", category: "studio", cover: { src: "/fixture.jpg", alt: "Fixture" } });
describe("grouped registered property specifications", () => {
  it("omits unknown defaults, whitespace and access-only data", () => {
    expect(propertySpecGroups({ ...empty, address: "住所", nearestStation: "駅", powerVoltage: "  ", availableDays: " " }, false)).toEqual([]);
  });
  it("maps registered fields to six groups without invented equipment or units", () => {
    const groups = propertySpecGroups({ ...empty, floorAreaSqm: 125.5, capacity: 20, ceilingHeightM: 3.7, interiorNotes: "白壁", availableScenes: "ホール", loadingDock: true, parkingCapacity: 4, hasNaturalLight: true, lightDirection: "南向き", soundproofing: true, powerVoltage: "100V / 200V", hasInternet: true, greenRoom: true, restroom: true, airConditioning: true, availableDays: "平日", bookingDeadline: "1週間前", minUsageHours: 2, scoutingFee: "要相談", extraFees: "清掃費別途", prohibitedItems: "火気禁止", permitRequired: true, permitType: "道路使用許可", permitNotes: "要申請" }, false);
    expect(groups.map(g => g.key)).toEqual(["space", "logistics", "environment", "power", "facilities", "conditions"]);
    expect(groups.map(g => g.items.map(i => i.value))).toEqual([
      ["125.5 m²", "20 名", "3.7 m", "白壁", "ホール"], ["有り", "4 台"], ["有り", "南向き", "有り"], ["100V / 200V", "有り"], ["有り", "有り", "有り"], ["平日", "1週間前", "2 時間", "要相談", "清掃費別途", "火気禁止", "要", "道路使用許可", "要申請"],
    ]);
  });
  it("omits indoor-only fields outdoors while retaining registered facilities and surroundings", () => {
    const groups = propertySpecGroups({ ...empty, category: "outdoor", ceilingHeightM: 3, interiorNotes: "室内", availableScenes: "広場", surroundings: "公道沿い", restroom: true }, false);
    expect(groups.map(g => g.items.map(i => i.value))).toEqual([["広場"], ["公道沿い"], ["有り"]]);
  });
  it("preserves registered surroundings for indoor locations too", () => {
    expect(propertySpecGroups({ ...empty, surroundings: "幹線道路沿い" }, false)).toEqual([
      { key: "environment", label: "光・音・周辺環境", items: [{ key: "surroundings", label: "周辺環境", value: "幹線道路沿い" }] },
    ]);
  });
  it("preserves hours and caveats without claiming public opening hours are shooting permission", () => {
    const groups = propertySpecGroups({ ...empty, category: "outdoor", customHoursStart: "09:00", customHoursEnd: "17:00", availableHours: "公道は24時間通行可・撮影は要許可" }, false);
    expect(groups[0].items).toEqual([{ key: "hours", label: "利用時間・条件", value: "09:00–17:00 公道は24時間通行可・撮影は要許可" }]);
    expect(propertySpecGroups({ ...empty, customHoursStart: "09:00" }, true)).toEqual([]);
  });
  it("uses available translations and original text fallback, with English units", () => {
    const p = { ...empty, capacity: 1, parking: true, minUsageHours: 1, availableHours: "平日", availableHoursEn: "Weekdays", permitType: "道路使用許可", permitTypeEn: "Road use permit", permitNotes: "要申請", permitNotesEn: "Apply first", interiorNotes: "白壁" };
    expect(propertySpecGroups(p, true).flatMap(g => g.items.map(i => i.value))).toEqual(["1 person", "白壁", "Available", "Weekdays", "1 hour", "Road use permit", "Apply first"]);
    expect(propertySpecGroups({ ...p, availableHoursEn: " ", permitTypeEn: "", permitNotesEn: "" }, true).at(-1)?.items.map(i => i.value)).toEqual(["平日", "1 hour", "道路使用許可", "要申請"]);
  });
});
