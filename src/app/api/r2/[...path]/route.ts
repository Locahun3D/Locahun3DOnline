import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

function toR2Range(header: string): { offset: number; length: number } | { suffix: number } | null {
  const m1 = header.match(/^bytes=(\d+)-(\d+)$/);
  if (m1) return { offset: parseInt(m1[1], 10), length: parseInt(m1[2], 10) - parseInt(m1[1], 10) + 1 };
  const m2 = header.match(/^bytes=(\d+)-$/);
  if (m2) return { offset: parseInt(m2[1], 10), length: 1024 * 1024 * 16 };
  const m3 = header.match(/^bytes=-(\d+)$/);
  if (m3) return { suffix: parseInt(m3[1], 10) };
  return null;
}

async function getBucket(): Promise<AnyBucket> {
  const { env } = await getCloudflareContext();
  return (env as Record<string, unknown>).R2_ASSETS;
}

// この route は GET に認証チェックが一切無い（画像等の公開アセット配信用）。
// 3DGS データ形式は /api/viewer-stream （Clerk 認証 + 閲覧権限チェック済み）
// 経由でのみ配信すること。以前は .zip 等が抜けており、URL さえ知っていれば
// 誰でも購読/トークン消費なしに 3DGS スキャンを丸ごと取得できてしまう欠陥が
// あった（実測で確認・修正済み）。オフラインビューアーの対応形式一覧
// （.splat/.ply/.spz/.ksplat/.rad/.sog/.pcsogs/.pcsogszip/.obj/.gltf/.glb/.fbx/.zip）
// を漏れなくブロックする。
const BLOCKED_3DGS_RE =
  /\.(splat|ply|spz|ksplat|rad|sog|pcsogs|pcsogszip|obj|gltf|glb|fbx|zip)$/i;

/**
 * 大きいボディは Cache-Control: public を付けない。
 * Workers 経由の大容量ストリームは途中切断されることがあり（実測: 116MB zip が
 * 56MB/40KB で truncate）、切れた本体が public キャッシュに保存されると、その URL は
 * TTL が切れるまで「壊れた ZIP」を返し続ける（invalid zip data が固定化する事故の元）。
 * 小さいファイル（画像等）は従来どおりキャッシュしてよい。
 */
const NO_CACHE_BYTES = 8 * 1024 * 1024;
function cacheControlFor(totalSize: number): string {
  return totalSize > NO_CACHE_BYTES
    ? "no-store"
    : "public, max-age=3600, stale-while-revalidate=86400";
}

/**
 * Serve files from R2 bucket at /api/r2/<key>.
 * 3DGS data files (.splat/.ply/.ksplat/.rad) are blocked — use /api/viewer-asset instead.
 * Single R2 call per Range request — avoids head()+get() double-call
 * that caused 503s under Spark's 12-parallel-fetcher load.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");

  if (BLOCKED_3DGS_RE.test(key)) {
    return NextResponse.json({ error: "Use /api/viewer-asset for 3DGS data" }, { status: 403 });
  }

  const rangeHeader = req.headers.get("range");

  // Next.js/OpenNext は既定で全レスポンスに RSC 用の Vary（next-router-state-tree
  // 等）を付与し、ヘッダーで上書きしても消えず追記される。これだと Cloudflare の
  // エッジキャッシュが Vary 起因で実質効かない（実測: CF-Cache-Status が付かない）。
  // 画像等の小容量・非 Range リクエストは Workers の Cache API で明示的に
  // キャッシュし、Vary の挙動に依存せず確実にエッジで完結させる。
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (cache && !rangeHeader) {
    const hit = await cache.match(req);
    if (hit) return hit;
  }

  try {
    const bucket = await getBucket();
    if (!bucket) {
      return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
    }

    if (rangeHeader) {
      const r2range = toR2Range(rangeHeader);
      if (!r2range) {
        return new NextResponse("Bad Range", { status: 400 });
      }

      const obj = await bucket.get(key, { range: r2range });
      if (!obj) return new NextResponse("Not found", { status: 404 });

      const total = obj.size;
      const offset = obj.range?.offset ?? 0;
      const length = obj.range?.length ?? (await obj.arrayBuffer()).byteLength;
      const end = offset + length - 1;

      const headers = new Headers();
      headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
      headers.set("Content-Length", String(length));
      headers.set("Content-Range", `bytes ${offset}-${end}/${total}`);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", cacheControlFor(total));
      // Next.js/OpenNext は既定で全レスポンスに RSC 用の
      // "Vary: rsc, next-router-state-tree, ..." を付与するが、これは生バイナリ
      // 配信には無関係かつリクエストごとに変わり得るヘッダーのため、Cloudflare
      // のエッジキャッシュがほぼ効かなくなる（実測: CF-Cache-Status が付かない）。
      // 明示的に上書きして純粋なバイナリ配信として正しくキャッシュさせる。
      headers.set("Vary", "Accept-Encoding");

      return new NextResponse(obj.body as ReadableStream, { status: 206, headers });
    }

    // Full response
    const obj = await bucket.get(key);
    if (!obj) return new NextResponse("Not found", { status: 404 });

    const size = obj.size ?? 0;
    const cacheable = cache && size > 0 && size <= NO_CACHE_BYTES;

    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
    if (obj.size) headers.set("Content-Length", String(obj.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", cacheControlFor(size));
    headers.set("Vary", "Accept-Encoding");

    // 小容量ファイル（画像等）は Cache API に保存できるよう body をバッファ化
    // する（ReadableStream は 1 回しか消費できないため）。cache.put は非同期で
    // 待たずに ctx.waitUntil に流し、レスポンス自体は即座に返す。
    if (cacheable) {
      const buf = await obj.arrayBuffer();
      const res = new NextResponse(buf, { headers });
      try {
        const { ctx } = await getCloudflareContext();
        ctx.waitUntil(cache!.put(req, res.clone()));
      } catch {
        /* waitUntil が使えない環境ではキャッシュ保存だけ諦める */
      }
      return res;
    }

    return new NextResponse(obj.body as ReadableStream, { headers });
  } catch (e) {
    console.error("R2 fetch error:", e);
    return NextResponse.json({ error: "R2 fetch failed" }, { status: 500 });
  }
}

/**
 * Upload file to R2 (admin only).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  await requireAdmin();
  const { path } = await params;
  const key = path.join("/");

  try {
    const bucket = await getBucket();
    if (!bucket) {
      return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
    }

    const body = req.body;
    if (!body) {
      return NextResponse.json({ error: "No body" }, { status: 400 });
    }

    await bucket.put(key, body, {
      httpMetadata: { contentType: req.headers.get("content-type") || "application/octet-stream" },
    });

    return NextResponse.json({ ok: true, key });
  } catch (e) {
    console.error("R2 upload error:", e);
    return NextResponse.json({ error: "R2 upload failed" }, { status: 500 });
  }
}
