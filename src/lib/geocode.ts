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

/**
 * 座標 → 日本の住所（逆ジオコーディング）。geocodeAddress の逆方向。
 * 国土地理院の逆ジオコーディングAPI（番地・大字まで強い）→ Nominatim reverse の順。
 * エディターの「座標から住所を自動取得」ボタンから使う。
 */
export async function reverseGeocodeAddress(
  lat: number,
  lng: number,
): Promise<string | null> {
  // 都道府県・市区町村名までは Nominatim reverse でしか一括取得できない
  // （国土地理院の逆ジオコーディングは大字以下しか返さず、都道府県は
  //  muniCd から別テーブルを引く必要があるため、ここでは Nominatim を主に使う）。
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=ja`,
      { headers: { "user-agent": GEO_UA, "accept-language": "ja" } },
    );
    if (r.ok) {
      const j = (await r.json()) as {
        address?: Record<string, string>;
        display_name?: string;
      };
      const a = j?.address;
      if (a) {
        const pref = a.state ?? "";
        const city = a.city ?? a.town ?? a.village ?? a.county ?? "";
        const ward = a.city_district ?? a.suburb ?? "";
        const rest = [a.neighbourhood, a.quarter, a.block ?? "", a.house_number]
          .filter(Boolean)
          .join("");
        const line = [pref, city, ward, rest].filter(Boolean).join("");
        if (line) return line;
      }
      if (j?.display_name) return j.display_name;
    }
  } catch {
    /* fall through */
  }
  return null;
}
