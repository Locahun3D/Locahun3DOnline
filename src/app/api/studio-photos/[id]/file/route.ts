import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { studioPhotoRepo } from "@/lib/studio-photos";
import { getStudioPhoto } from "@/lib/studio-photo-storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/studio-photos/<id>/file — 隔離中の写真を**運営だけ**が見るための口
 * （2026-09-26）。公開配信の /api/r2 は quarantine/ を拒否しているので、
 * 採用前の写真を見られるのはここだけ。
 *
 * 万一おかしなファイルが混じっていても実行されないよう、
 *  - Content-Type はこちらが判定した値で固定（送られてきた名乗りは使わない）
 *  - X-Content-Type-Options: nosniff（ブラウザに推測させない）
 *  - CSP sandbox（スクリプト・プラグインを一切動かさない）
 * を付ける。
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await ctx.params;
  const photo = await studioPhotoRepo.get(id);
  if (!photo) return new NextResponse("not found", { status: 404 });
  const body = await getStudioPhoto(photo.r2Key);
  if (!body) return new NextResponse("not found", { status: 404 });
  return new NextResponse(body, {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    },
  });
}
