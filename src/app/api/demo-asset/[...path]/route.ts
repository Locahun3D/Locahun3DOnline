import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

// デモシーンは「ログイン不要の公開プレビュー」。開放プロキシ化を防ぐため、
// 配信を許可する R2 キーをここに固定ホワイトリストする（デモ用ファイルのみ）。
const ALLOWED_KEYS = new Set<string>([
  "Kousaten_ForDemo_point_cloud.rad",
]);

function toR2Range(
  header: string,
): { offset: number; length: number } | { suffix: number } | null {
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

/**
 * デモシーン専用の公開ストリーミングプロキシ（認証なし）。
 * R2 公開アクセスを無効化したため、デモ(交差点)を誰でも見られるようにする代替。
 * ALLOWED_KEYS のファイルだけを配信し、それ以外は404（開放プロキシ防止）。
 * Range 対応（Spark のページング RAD ローダが分割取得するため必須）。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");

  if (!ALLOWED_KEYS.has(key)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const bucket = await getBucket();
    if (!bucket) {
      return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
    }

    const rangeHeader = req.headers.get("range");
    // 公開デモは不変アセットなので長期キャッシュ可（CDN/ブラウザ両方）。
    const cache = "public, max-age=86400";

    if (rangeHeader) {
      const r2range = toR2Range(rangeHeader);
      if (!r2range) return new NextResponse("Bad Range", { status: 400 });
      const obj = await bucket.get(key, { range: r2range });
      if (!obj) return new NextResponse("Not found", { status: 404 });

      const total = obj.size;
      const offset = obj.range?.offset ?? 0;
      const length = obj.range?.length ?? (await obj.arrayBuffer()).byteLength;
      const end = offset + length - 1;

      const headers = new Headers();
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Length", String(length));
      headers.set("Content-Range", `bytes ${offset}-${end}/${total}`);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", cache);
      return new NextResponse(obj.body as ReadableStream, { status: 206, headers });
    }

    const obj = await bucket.get(key);
    if (!obj) return new NextResponse("Not found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    if (obj.size) headers.set("Content-Length", String(obj.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", cache);
    return new NextResponse(obj.body as ReadableStream, { headers });
  } catch (e) {
    console.error("demo-asset error:", e);
    return NextResponse.json({ error: "stream failed" }, { status: 500 });
  }
}
