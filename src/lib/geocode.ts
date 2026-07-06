import "server-only";

/**
 * 日本の住所/地名 → 座標。国土地理院(GSI、番地まで強い) → Nominatim(OSM) の順で
 * 試す。ブラウザから直接だと CORS/UA で弾かれるためサーバー側専用。
 * `/api/admin/resolve-maps`（手動貼り付け）と `ai-location`（AI検索結果の確定）
 * の両方から共有される。
 */

const GEO_UA = "locahun3d-online/1.0 (admin geocode)";

export async function geocodeAddress(
  q: string,
): Promise<{ lat: number; lng: number } | null> {
  // 1) 国土地理院 住所検索（日本の詳細住所に強い）
  try {
    const r = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
      { headers: { "user-agent": GEO_UA } },
    );
    if (r.ok) {
      const arr = (await r.json()) as Array<{
        geometry?: { coordinates?: [number, number] };
      }>;
      const c = arr?.[0]?.geometry?.coordinates;
      if (c && c.length === 2) {
        const [lng, lat] = c; // GSI は [経度, 緯度]
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
      }
    }
  } catch {
    /* fall through */
  }
  // 2) Nominatim（OSM）フォールバック
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=${encodeURIComponent(q)}`,
      { headers: { "user-agent": GEO_UA, "accept-language": "ja" } },
    );
    if (r.ok) {
      const arr = (await r.json()) as Array<{ lat: string; lon: string }>;
      if (arr?.[0]) {
        const lat = parseFloat(arr[0].lat);
        const lng = parseFloat(arr[0].lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}
