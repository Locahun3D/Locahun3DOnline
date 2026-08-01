import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { reverseGeocodeAddress } from "@/lib/geocode";

export const runtime = "nodejs";

/**
 * 座標 → 住所（サーバー側）。エディターの「座標から住所を自動取得」ボタン用。
 * 本体は @/lib/geocode に共通化（resolve-maps の逆方向）。
 */
export async function POST(req: Request) {
  await requireAdmin();

  let lat = NaN;
  let lng = NaN;
  try {
    const body = (await req.json()) as { lat?: number; lng?: number };
    lat = Number(body.lat);
    lng = Number(body.lng);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "座標が不正です" }, { status: 400 });
  }

  const address = await reverseGeocodeAddress(lat, lng);
  if (!address) {
    return NextResponse.json(
      { error: "座標から住所を取得できませんでした。手入力してください。" },
      { status: 422 },
    );
  }
  return NextResponse.json({ address });
}
