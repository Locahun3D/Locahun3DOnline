import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";

export const runtime = "nodejs";

/**
 * Google Maps 共有リンク（maps.app.goo.gl / goo.gl/maps などの短縮URL）を
 * サーバー側でリダイレクト解決し、展開後URL（または本文）から緯度経度を抽出する。
 * 短縮URL自体は座標を含まないため、クライアントの正規表現だけでは「解析」できない。
 */

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
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json(
      { error: "Google Maps の URL を入力してください" },
      { status: 400 },
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
