import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

async function getBucket(): Promise<AnyBucket> {
  const { env } = await getCloudflareContext();
  return (env as Record<string, unknown>).R2_ASSETS;
}

/** POST: init or complete multipart upload */
export async function POST(req: NextRequest) {
  await requireAdmin();
  try {
    const bucket = await getBucket();
    if (!bucket) return NextResponse.json({ error: "R2 not configured" }, { status: 503 });

    const { action, key, uploadId, parts } = await req.json();

    if (action === "init") {
      const mpu = await bucket.createMultipartUpload(key);
      return NextResponse.json({ uploadId: mpu.uploadId, key: mpu.key });
    }

    if (action === "complete") {
      const mpu = bucket.resumeMultipartUpload(key, uploadId);
      const obj = await mpu.complete(parts);
      return NextResponse.json({ ok: true, key, size: obj.size });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT: upload a single part */
export async function PUT(req: NextRequest) {
  await requireAdmin();
  try {
    const bucket = await getBucket();
    if (!bucket) return NextResponse.json({ error: "R2 not configured" }, { status: 503 });

    const key = req.nextUrl.searchParams.get("key");
    const uploadId = req.nextUrl.searchParams.get("uploadId");
    const partNumber = Number(req.nextUrl.searchParams.get("partNumber"));

    if (!key || !uploadId || !partNumber) {
      return NextResponse.json({ error: "Missing key/uploadId/partNumber" }, { status: 400 });
    }

    const mpu = bucket.resumeMultipartUpload(key, uploadId);

    // Read body into ArrayBuffer for R2 compatibility
    const body = await req.arrayBuffer();

    const part = await mpu.uploadPart(partNumber, body);

    return NextResponse.json({ partNumber: part.partNumber, etag: part.etag });
  } catch (e: unknown) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
