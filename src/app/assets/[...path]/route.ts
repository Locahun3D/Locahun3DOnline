import { safeAssetKey, serveWorksAsset } from "@/lib/works-assets";

/**
 * GET /assets/**  → R2 `assets/**`
 *
 * 旧マーケサイト（web.locahun3d.com）の共有アセット置き場。works 記事の OGP 画像
 * （/assets/Digiloke_OG_Cover.jpg 等）が絶対URLで参照しているため、統合後も
 * 同じ URL で配り続ける必要がある（X で共有済みのカード画像が壊れる）。
 */
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = safeAssetKey("assets", path);
  if (!key) return new Response("Not found", { status: 404 });
  return serveWorksAsset(key, req);
}
