import type { Property } from "./schemas";

export type PropertySpecKey = "area" | "ceiling" | "room" | "power" | "internet" | "parking" | "address" | "station" | "hours";
export interface PropertySpecCard { key: PropertySpecKey; label: string; value: string; registered: boolean }
export function propertySpecSummary(property: Property, en: boolean): PropertySpecCard[] {
  const available = en ? "Available" : "有り";
  const number = (value: number, unit: string) => Number.isFinite(value) && value > 0
    ? `${value.toLocaleString(en ? "en-US" : "ja-JP", { maximumFractionDigits: 20 })} ${unit}` : "";
  const localized = (ja: string, english: string) => (en && english.trim() ? english : ja).trim();
  const hours = [
    property.customHoursStart && property.customHoursEnd ? `${property.customHoursStart}–${property.customHoursEnd}` : "",
    localized(property.availableHours, property.availableHoursEn),
  ].filter(Boolean).join(" ");
  const card = (key: PropertySpecKey, label: string, value: string): PropertySpecCard => ({ key, label, value, registered: !!value });
  // Schema false is also the default for unregistered fields, not proof of absence.
  return [
    card("area", en ? "Floor area" : "面積", number(property.floorAreaSqm, "m²")),
    card("ceiling", en ? "Ceiling height" : "天井高", number(property.ceilingHeightM, "m")),
    card("room", en ? "Green room" : "控室", property.greenRoom ? available : ""),
    card("power", en ? "Power (voltage)" : "電気（電圧）", property.powerVoltage.trim()),
    card("internet", en ? "Internet" : "インターネット", property.hasInternet ? available : ""),
    card("parking", en ? "Parking" : "駐車場", number(property.parkingCapacity, en ? (property.parkingCapacity === 1 ? "space" : "spaces") : "台") || (property.parking ? available : "")),
    card("address", en ? "Address" : "住所", localized(property.address, property.addressEn)),
    card("station", en ? "Nearest station" : "最寄り駅", localized(property.nearestStation, property.nearestStationEn)),
    card("hours", en ? "Available hours" : "利用可能時間", hours),
  ].filter(item => item.registered);
}
