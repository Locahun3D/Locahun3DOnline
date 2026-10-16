import { NextResponse } from "next/server";
import { repo as propertyRepo } from "@/lib/store";

export const runtime = "nodejs";

/**
 * ビューアー注釈の英訳を ?lang=en のビューアーへ渡す（2026-10-16）。
 * 中身は定期処理 media-english-job が作った splatItems[scene].sceneTextEn（写真ピンの案内文・区画ラベル・
 * 写真内の文字の英訳）。公開中の物件の「公開」シーンだけ返す（NDA限定・制限ありのシーンの注釈は出さない）。
 * scene は splatItem の id（無ければ位置の番号）。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; scene: string }> }) {
  const { id, scene } = await params;
  const property = await propertyRepo.get(id);
  if (!property || property.status !== "published") return NextResponse.json({ texts: {}, images: {} }, { status: 404 });
  const item = property.splatItems.find((s) => s.id === scene) ?? property.splatItems[Number(scene)];
  if (!item || item.accessLevel !== "public" || !item.sceneTextEn || item.sceneTextEn.source !== item.splatUrl) {
    return NextResponse.json({ texts: {}, images: {} });
  }
  return NextResponse.json(
    { texts: item.sceneTextEn.texts, images: item.sceneTextEn.images },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
