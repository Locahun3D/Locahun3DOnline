import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

/**
 * 公開シーンの「事前に作った当たり判定」（2026-11-10 本人「あたり判定、最初からないと移動できず不便。
 * もともと準備できない？ストリーミングが遅くならないように」）。
 *
 * ビューアーは開いた直後、3DGS の中身の識別子（/api/viewer-stream の ETag "l3d-content-…"）と配置から
 * 決まる 64 桁のキーでここを 1 回だけ取りに来る。あれば数百 KB の判定データをそのまま使い、
 * 本体（大きいシーンで約 180 MB）を読み直して作る処理をしない。無ければ 404 → 従来どおり手元で作る。
 *
 * - R2 キーは `collision/<key>.lct`。`scripts/bake-collision.mjs` が公開シーンを実ブラウザで開いて作り、
 *   新しいキーとして追加する（上書きしない）。
 * - 中身はキーで決まる（キーを含む gzip。ビューアーが復号時にキーを照合する）ので、長期キャッシュしてよい。
 * - 整合性: アップロード時に R2 のメタデータへ sha256 を入れ、`X-L3D-Sha256` で返す。ビューアーが照合する。
 * - キーは 3DGS 本体の R2 ETag から作るハッシュで、本体を見られない人には分からない。公開シーンだけを置く。
 */
const NAME_RE = /^([a-f0-9]{64})\.lct$/;
const MAX_BYTES = 16_000_000;

async function getBucket(): Promise<AnyBucket> {
  const { env } = await getCloudflareContext();
  return (env as Record<string, unknown>).R2_ASSETS;
}

function notFound() {
  // 404 は覚えさせない（あとから作ったファイルがすぐ効くように）。
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

async function handle(req: NextRequest, name: string, head: boolean) {
  const match = NAME_RE.exec(name);
  if (!match) return notFound();
  const bucket = await getBucket();
  if (!bucket) return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  const key = `collision/${match[1]}.lct`;
  const obj = await (head ? bucket.head(key) : bucket.get(key));
  if (!obj) return notFound();
  const sha256 = String(obj.customMetadata?.sha256 ?? "");
  if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(obj.size) || obj.size <= 0 || obj.size > MAX_BYTES) {
    await obj.body?.cancel?.();
    return notFound();
  }
  const headers = new Headers();
  // 中身は gzip 済みのバイナリ。octet-stream のままにして経路で再圧縮させない（Content-Length を保つ）。
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Content-Length", String(obj.size));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", obj.httpEtag);
  headers.set("X-L3D-Sha256", sha256);
  headers.set("X-Content-Type-Options", "nosniff");
  if (head) return new NextResponse(null, { headers });
  // 小さい（上限 16 MB）ので読み切って返す（ストリームのままだと Content-Length が落ちることがある）。
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (bytes.byteLength !== obj.size) return notFound();
  return new NextResponse(bytes, { headers });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    return await handle(req, name, false);
  } catch (e) {
    console.error("collision error:", e);
    return new NextResponse(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function HEAD(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    return await handle(req, name, true);
  } catch (e) {
    console.error("collision error:", e);
    return new NextResponse(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
