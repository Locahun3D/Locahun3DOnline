import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

const ALLOWED_RE = /\.(splat|ply|ksplat|rad)$/i;

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
 * Authenticated R2 streaming proxy for 3DGS assets.
 * Same-origin Range requests — avoids cross-origin presigned URL issues with Spark paged loader.
 * Auth: Clerk → viewer access check (admin / paid / free period).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");

  if (!ALLOWED_RE.test(key)) {
    return NextResponse.json({ error: "Not a 3DGS asset" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const settings = await getSettings();
  const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());
  const hasAccess = user.role === "admin" || (!!user.plan && user.plan !== "free") || freeAccess;
  if (!hasAccess) {
    return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 });
  }

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
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Length", String(length));
      headers.set("Content-Range", `bytes ${offset}-${end}/${total}`);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "no-store");

      return new NextResponse(obj.body as ReadableStream, { status: 206, headers });
    }

    const obj = await bucket.get(key);
    if (!obj) return new NextResponse("Not found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    if (obj.size) headers.set("Content-Length", String(obj.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new NextResponse(obj.body as ReadableStream, { headers });
  } catch (e) {
    console.error("viewer-stream error:", e);
    return NextResponse.json({ error: "stream failed" }, { status: 500 });
  }
}
