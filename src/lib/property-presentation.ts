export function propertyTitleSegments(title: string): string[] {
  return Array.from(new Intl.Segmenter("ja", { granularity: "word" }).segment(title), part => part.segment);
}

/** Hide this owner's personal address only in the public presentation. */
export function publicPropertyEmail(id: string, email: string): string {
  return id === "shibuyasq" ? "" : email;
}

/**
 * Google マップの検索語。施設名＋住所を優先する（座標だと施設として出ず、
 * レビューも見られない — 2026-09-19 UI改善会議）。名前・住所が無ければ座標。
 */
export function googleMapsQuery(coords: { lat: number; lng: number } | null, address: string, name = ""): string {
  const cleanName = name.replace(/\s+/g, " ").trim();
  const text = [cleanName, address.trim()].filter(Boolean).join(" ");
  if (text) return text;
  return coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? `${coords.lat},${coords.lng}` : "";
}

export function googleMapsUrl(coords: { lat: number; lng: number } | null, address: string, name = ""): string {
  const query = googleMapsQuery(coords, address, name);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

/** APIキー不要の埋め込み地図 URL（iframe 用）。 */
export function googleMapsEmbedUrl(coords: { lat: number; lng: number } | null, address: string, name = ""): string {
  const query = googleMapsQuery(coords, address, name);
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : "";
}
