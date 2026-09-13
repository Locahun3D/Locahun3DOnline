import type { Property } from "./schemas";
import { propertySpecSummary } from "./property-spec-summary";

export interface PropertySpecGroup {
  key: string;
  label: string;
  items: Array<{ key: string; label: string; value: string }>;
}

export function propertySpecGroups(property: Property, en: boolean): PropertySpecGroup[] {
  const p = property;
  const outdoor = p.category === "outdoor";
  const summary = propertySpecSummary(p, en);
  const value = (key: string) => summary.find(item => item.key === key)?.value || "";
  const text = (ja: string, english: string) => en ? english : ja;
  const localized = (ja: string, english: string) => (en && english.trim() ? english : ja).trim();
  const yes = (registered: boolean) => registered ? text("有り", "Available") : "";
  const number = (n: number, unit: string) => Number.isFinite(n) && n > 0 ? `${n.toLocaleString(en ? "en-US" : "ja-JP")} ${unit}` : "";
  const item = (key: string, ja: string, english: string, content: string) => ({ key, label: text(ja, english), value: content.trim() });
  const group = (key: string, ja: string, english: string, items: PropertySpecGroup["items"]): PropertySpecGroup => ({ key, label: text(ja, english), items: items.filter(i => i.value) });
  // False and zero are schema defaults: neither establishes that a facility is absent.
  return [
    group("space", "広さ・空間", "Space", [
      item("area", "面積", "Floor area", value("area")),
      item("capacity", "収容人数", "Capacity", number(p.capacity, text("名", p.capacity === 1 ? "person" : "people"))),
      item("ceiling", "天井高", "Ceiling height", outdoor ? "" : value("ceiling")),
      item("interior", "内装", "Interior", outdoor ? "" : p.interiorNotes),
      item("scenes", "撮影できるシーン・空間", "Available scenes and spaces", p.availableScenes),
    ]),
    group("logistics", "搬入・駐車", "Loading & parking", [
      item("loading", "搬入スペース", "Loading area", yes(p.loadingDock)),
      item("parking", "駐車場", "Parking", value("parking")),
    ]),
    group("environment", "光・音・周辺環境", "Light, sound & surroundings", [
      item("naturalLight", "自然光", "Natural light", yes(p.hasNaturalLight)),
      item("lightDirection", "採光・方角", "Light direction", p.lightDirection),
      item("soundproofing", "防音設備", "Soundproofing", yes(p.soundproofing)),
      item("surroundings", "周辺環境", "Surroundings", p.surroundings),
    ]),
    group("power", "電源・通信", "Power & connectivity", [
      item("power", "電気（電圧）", "Power (voltage)", value("power")),
      item("internet", "インターネット", "Internet", value("internet")),
    ]),
    group("facilities", "控室・設備", "Facilities", [
      item("room", "控室", "Green room", value("room")),
      item("restroom", "トイレ", "Restroom", yes(p.restroom)),
      item("airConditioning", "空調", "Air conditioning", yes(p.airConditioning)),
    ]),
    group("conditions", "利用条件", "Usage conditions", [
      item("hours", "利用時間・条件", "Hours & conditions", value("hours")),
      item("days", "撮影可能日", "Available days", p.availableDays),
      item("deadline", "申込期限", "Booking deadline", p.bookingDeadline),
      item("minimumHours", "最低利用時間", "Minimum usage", number(p.minUsageHours, text("時間", p.minUsageHours === 1 ? "hour" : "hours"))),
      item("scoutingFee", "ロケハン費", "Scouting fee", p.scoutingFee),
      item("extraFees", "追加費用", "Additional fees", p.extraFees),
      item("prohibited", "禁止事項", "Prohibited activities", p.prohibitedItems),
      item("permitRequired", "撮影許可", "Filming permit", p.permitRequired ? text("要", "Required") : ""),
      item("permitType", "許可の種類", "Permit type", localized(p.permitType, p.permitTypeEn)),
      item("permitNotes", "許可・注意事項", "Permit notes", localized(p.permitNotes, p.permitNotesEn)),
    ]),
  ].filter(g => g.items.length > 0);
}
