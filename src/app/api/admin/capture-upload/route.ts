import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/dal";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { saveLocalUpload } from "@/lib/uploads";

const R2_PUBLIC_BASE = "https://pub-6fe11fc6301a424ba739695a7c4d2dd9.r2.dev";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const file = form.get("file");
  const propertyId = String(form.get("propertyId") ?? "").trim();
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (!propertyId) {
    return NextResponse.json({ error: "no_property_id" }, { status: 400 });
  }

  const id = nanoid(6);
  const ext = file.name.endsWith(".mp4") ? "mp4" : "webm";
  const contentType = ext === "mp4" ? "video/mp4" : "video/webm";
  const key = `uploads/${propertyId}/${id}-preview.${ext}`;

  try {
    if (process.env.NODE_ENV === "production") {
      const { env } = await getCloudflareContext();
      const r2 = (env as Record<string, unknown>).R2_ASSETS as {
        put(key: string, value: ArrayBuffer, opts?: Record<string, unknown>): Promise<unknown>;
      };
      const buf = await file.arrayBuffer();
      await r2.put(key, buf, {
        httpMetadata: { contentType },
      });
      return NextResponse.json({ url: `${R2_PUBLIC_BASE}/${key}` });
    }

    const result = await saveLocalUpload(propertyId, file);
    return NextResponse.json({ url: result.url });
  } catch (e) {
    console.error("[capture-upload]", e);
    return NextResponse.json(
      { error: "upload_failed", message: String(e instanceof Error ? e.message : e) },
      { status: 500 },
    );
  }
}
