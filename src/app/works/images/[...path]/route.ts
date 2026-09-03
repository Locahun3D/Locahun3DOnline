import { safeAssetKey, serveWorksAsset } from "@/lib/works-assets";

/** GET /works/images/**  → R2 `works/images/**`（URL 不変・本人指示 2026-08-16）。 */
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = safeAssetKey("works/images", path);
  if (!key) return new Response("Not found", { status: 404 });
  return serveWorksAsset(key, req);
}
