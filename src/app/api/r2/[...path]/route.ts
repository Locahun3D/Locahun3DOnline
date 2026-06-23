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

/**
 * Serve files from R2 bucket at /api/r2/<key>.
 * Single R2 call per Range request — avoids head()+get() double-call
 * that caused 503s under Spark's 12-parallel-fetcher load.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");

  try {
    const bucket = await getBucket();
    if (!bucket) {
      return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
    }

    const rangeHeader = req.headers.get("range");

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
      headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");

      return new NextResponse(obj.body as ReadableStream, { status: 206, headers });
    }

    // Full response
    const obj = await bucket.get(key);
    if (!obj) return new NextResponse("Not found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
    if (obj.size) headers.set("Content-Length", String(obj.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");

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
