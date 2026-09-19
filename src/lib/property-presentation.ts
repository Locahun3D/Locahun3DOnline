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

/**
 * 「用途別の目安」（物件ページ概要カード、2026-09-19 本人採用の案18）。
 * 単価だけでは「結局いくら？」に答えないため、撮影の単位（スチール少人数／半日／ムービー1日）で
 * 合計を出す。最低利用時間を下回る行は最低時間に切り上げる。日額があれば1日行はそれを使う。
 * 時間貸し以外（定額・無料）や単価未設定では出さない。
 */
export type UsageEstimate = { key: "still-small" | "still-half" | "movie-day"; hours: number; total: number; daily: boolean };
export function usageEstimates(p: { priceType: string; hourlyPrice: number; minUsageHours: number; dailyPrice: number }): UsageEstimate[] {
  if (p.priceType !== "hourly" || !(p.hourlyPrice > 0)) return [];
  const min = Math.max(0, p.minUsageHours | 0);
  const row = (key: UsageEstimate["key"], base: number): UsageEstimate => {
    const hours = Math.max(base, min);
    return { key, hours, total: hours * p.hourlyPrice, daily: false };
  };
  const day = p.dailyPrice > 0 ? { ...row("movie-day", 9), total: p.dailyPrice, daily: true } : row("movie-day", 9);
  return [row("still-small", 3), row("still-half", 5), day];
}
