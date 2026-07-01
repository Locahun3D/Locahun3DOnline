import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";

export const runtime = "nodejs";

/**
 * 座標解決（サーバー側）。次の入力を緯度経度に変換する:
 *  - Google Maps 共有リンク（maps.app.goo.gl 等の短縮URL）→ リダイレクト解決して抽出
 *  - 日本の住所/地名 → 国土地理院(GSI)で住所検索、ダメなら Nominatim にフォールバック
 * GSI/Nominatim はブラウザから直接だと CORS/UA で弾かれるためサーバー側で実行する。
 */

const GEO_UA = "locahun3d-online/1.0 (admin geocode)";

/** 日本の住所/地名 → 座標。GSI（番地まで強い）→ Nominatim の順で試す。 */
async function geocodeAddress(
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

function extractCoords(s: string): { lat: number; lng: number } | null {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // /@lat,lng
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // data=!3dlat!4dlng
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, // ?q=lat,lng
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/, // ?ll=lat,lng
    /\/(-?\d+\.\d{4,}),(-?\d+\.\d{4,})/, // /lat,lng（高精度のみ）
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (
        !Number.isNaN(lat) &&
        !Number.isNaN(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        return { lat, lng };
      }
    }
  }
  return null;
}

export async function POST(req: Request) {
  await requireAdmin();

  let url = "";
  try {
    url = String(((await req.json()) as { url?: string }).url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json(
      { error: "住所・Google Maps の URL・座標 のいずれかを入力してください" },
      { status: 400 },
    );
  }

  // URL でなければ住所/地名として扱い、ジオコーディングする。
  if (!/^https?:\/\//.test(url)) {
    const coords = await geocodeAddress(url);
    if (coords) return NextResponse.json({ coords });
    return NextResponse.json(
      {
        error:
          "住所から座標を取得できませんでした。番地まで含めた住所、または Google Maps の URL でお試しください。",
      },
      { status: 422 },
    );
  }

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        // 短縮リンクのリダイレクトを確実に展開させるため一般的なUAを付与。
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "ja,en;q=0.8",
      },
    });

    const finalUrl = res.url || url;
    let coords = extractCoords(decodeURIComponent(finalUrl));

    if (!coords) {
      // 展開後URLに座標が無い場合は本文（HTML）から拾う。
      const text = await res.text();
      coords = extractCoords(text);
    }

    if (!coords) {
      return NextResponse.json(
        {
          error:
            "座標を取得できませんでした。Google Maps で対象地点を右クリック→座標をコピーして貼り付けてください。",
          finalUrl,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ coords, finalUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
