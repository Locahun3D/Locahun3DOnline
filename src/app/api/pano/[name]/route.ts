import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

/**
 * 公開シーンの「開始位置の 360° 画像」（2026-11-10 本人「この静止画を最初に挟むの、locahunでも採用」）。
 *
 * ビューアー（Locahun3D src/js/292b_start_pano.js）は開いた直後、3DGS の中身の識別子
 * （/api/viewer-stream の ETag "l3d-content-…" と長さ）から決まる 64 桁のキーで
 * `<key>.json`（開始位置・向き）と `<key>-{f,r,b,l,u,d}.jpg`（6 方向・各 90°）を取りに来る。
 * あれば 3D の上にかぶせて見せ、その場で見回す間は画像のまま、位置が動いたら 3D に切り替える。無ければ 404 で何もしない。
 *
 * - R2 キーは `pano/<key>.json` と `pano/<key>-<面>.jpg`。`scripts/bake-pano.mjs` が公開シーンを実ブラウザで開いて作り、
 *   新しいキーとして追加する（上書きしない）。シーンを作り直すと ETag が変わり、別のキーになる。
 * - 中身はキーで決まるので長期キャッシュしてよい。キーは 3DGS 本体の ETag から作るハッシュで、本体を見られない人には分からない。公開シーンだけを置く。
 */
const NAME_RE = /^([a-f0-9]{64})(\.json|-[frbldu]\.jpg)$/;
const MAX_BYTES = 4_000_000;

async function getBucket(): Promise<AnyBucket> {
  const { env } = await getCloudflareContext();
  return (env as Record<string, unknown>).R2_ASSETS;
}

function notFound() {
  // 404 は覚えさせない（あとから作った画像がすぐ効くように）。
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

async function handle(req: NextRequest, name: string, head: boolean) {
  const match = NAME_RE.exec(name);
  if (!match) return notFound();
  const bucket = await getBucket();
  if (!bucket) return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  const obj = await (head ? bucket.head(`pano/${name}`) : bucket.get(`pano/${name}`));
  if (!obj) return notFound();
  if (!Number.isSafeInteger(obj.size) || obj.size <= 0 || obj.size > MAX_BYTES) {
    await obj.body?.cancel?.();
    return notFound();
  }
  const headers = new Headers();
  headers.set("Content-Type", match[2] === ".json" ? "application/json" : "image/jpeg");
  headers.set("Content-Length", String(obj.size));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", obj.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  if (head) return new NextResponse(null, { headers });
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (bytes.byteLength !== obj.size) return notFound();
  return new NextResponse(bytes, { headers });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  return handle(req, (await params).name, false);
}

export async function HEAD(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  return handle(req, (await params).name, true);
}
