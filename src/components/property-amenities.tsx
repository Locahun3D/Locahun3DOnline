import type { Property } from "@/lib/schemas";

/**
 * 設備・条件をアイコンで並べる（2026-09-19 UI改善会議: スペースマーケットの
 * 設備欄のように「絵で誰でもわかる」形にする）。あり＝濃色、なし＝薄色＋取り消し線。
 * 屋外物件はスタジオ向け設備が軒並み「なし」になるため、ありの項目だけ出す。
 */
type Amenity = { key: string; ja: string; en: string; on: boolean; icon: React.ReactNode };

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const icons = {
  parking: (
    <svg viewBox="0 0 24 24" {...S}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M9.5 17V7.5h3.5a3 3 0 0 1 0 6H9.5" /></svg>
  ),
  loadIn: (
    <svg viewBox="0 0 24 24" {...S}><rect x="2.5" y="7" width="11" height="9" /><path d="M13.5 10h4l3 3v3h-7z" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>
  ),
  soundproof: (
    <svg viewBox="0 0 24 24" {...S}><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" /></svg>
  ),
  internet: (
    <svg viewBox="0 0 24 24" {...S}><path d="M3 9.5a13 13 0 0 1 18 0M6 12.8a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0" /><circle cx="12" cy="19" r="0.9" fill="currentColor" /></svg>
  ),
  aircon: (
    <svg viewBox="0 0 24 24" {...S}><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /><path d="M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5" /></svg>
  ),
  greenRoom: (
    <svg viewBox="0 0 24 24" {...S}><path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3.5 21h17" /><circle cx="14.5" cy="12.5" r="0.9" fill="currentColor" /></svg>
  ),
  restroom: (
    <svg viewBox="0 0 24 24" {...S}><circle cx="7.5" cy="5" r="1.8" /><circle cx="16.5" cy="5" r="1.8" /><path d="M5.5 21v-6H4.5l1-6.5h4l1 6.5h-1v6M14.5 21V9h4v12M12 3v18" /></svg>
  ),
  smoking: (
    <svg viewBox="0 0 24 24" {...S}><rect x="2.5" y="14" width="15" height="3.5" /><path d="M20 14v3.5M17 11c0-1.6 2-1.6 2-3.3S17 6 17 4.5M20.5 11c0-1.6 1.5-1.6 1.5-3" /></svg>
  ),
  fire: (
    <svg viewBox="0 0 24 24" {...S}><path d="M12 21a6 6 0 0 0 6-6c0-3.5-2.5-5.5-3.5-9-1 2-2.5 3-3.5 3 0-2-1-3.5-2-5C8 8 6 10.5 6 15a6 6 0 0 0 6 6z" /><path d="M12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.5 1.2-2.3 2.5-4 1.3 1.7 2.5 2.5 2.5 4A2.5 2.5 0 0 1 12 21z" /></svg>
  ),
};

export function propertyAmenities(p: Property): Amenity[] {
  return [
    { key: "parking", ja: "駐車場", en: "Parking", on: p.parking, icon: icons.parking },
    { key: "loadIn", ja: "大型搬入", en: "Large load-in", on: p.loadingDock, icon: icons.loadIn },
    { key: "soundproof", ja: "防音", en: "Soundproof", on: p.soundproofing, icon: icons.soundproof },
    { key: "internet", ja: "ネット", en: "Internet", on: p.hasInternet, icon: icons.internet },
    { key: "aircon", ja: "空調", en: "Air-con", on: p.airConditioning, icon: icons.aircon },
    { key: "greenRoom", ja: "控室", en: "Green room", on: p.greenRoom, icon: icons.greenRoom },
    { key: "restroom", ja: "トイレ", en: "Restroom", on: p.restroom, icon: icons.restroom },
    { key: "smoking", ja: "喫煙所", en: "Smoking area", on: p.smokingArea, icon: icons.smoking },
    { key: "fire", ja: "火気使用", en: "Open flame", on: p.fireAllowed, icon: icons.fire },
  ];
}

export default function PropertyAmenities({ property, en }: { property: Property; en: boolean }) {
  const outdoor = property.category === "outdoor";
  const items = propertyAmenities(property).filter((a) => a.on || !outdoor);
  if (items.length === 0) return null;
  return (
    <ul data-property-amenities className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-6">
      {items.map((a) => (
        <li
          key={a.key}
          aria-label={`${en ? a.en : a.ja}: ${a.on ? (en ? "available" : "あり") : en ? "not available" : "なし"}`}
          className={`flex flex-col items-center gap-1.5 border px-1 py-3 text-center ${
            a.on ? "border-ink/25 text-ink" : "border-line text-ink/30"
          }`}
        >
          <span className="w-7 h-7 block" aria-hidden="true">{a.icon}</span>
          <span className={`text-[12px] font-bold leading-tight ${a.on ? "" : "line-through"}`}>
            {en ? a.en : a.ja}
          </span>
        </li>
      ))}
    </ul>
  );
}
