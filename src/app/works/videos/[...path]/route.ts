import { safeAssetKey, serveWorksAsset } from "@/lib/works-assets";

/**
 * GET /works/videos/**  → R2 `works/videos/**`（URL 不変・本人指示 2026-08-16）。
 * Range 対応は serveWorksAsset 側（動画は 206 を返せないと Safari が再生しない）。
 */
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = safeAssetKey("works/videos", path);
  if (!key) return new Response("Not found", { status: 404 });
  return serveWorksAsset(key, req);
}
