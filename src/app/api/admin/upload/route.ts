import { NextResponse } from "next/server";
import {
  handleUpload,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_SPLAT_EXTENSIONS,
  MAX_IMAGE_BYTES,
  MAX_SPLAT_BYTES,
} from "@/lib/uploads";

/**
 * Admin upload endpoint.
 *
 * Multipart form fields:
 *   - file        : the file blob
 *   - propertyId  : property id to bucket the upload under
 *   - kind        : "image" | "splat"
 *
 * Returns: { url: string, size: number, contentType: string }
 *
 * Note: no auth here yet. When Clerk is wired, gate with the same
 * NEXT_PUBLIC_ADMIN_BYPASS / role check used by /admin layout.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ADMIN_BYPASS !== "1") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const file = form.get("file");
  const propertyId = String(form.get("propertyId") ?? "").trim();
  const kind = String(form.get("kind") ?? "image");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (!propertyId) {
    return NextResponse.json({ error: "no_property_id" }, { status: 400 });
  }

  // Validate by kind.
  if (kind === "image") {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: "bad_image_type",
          message: `画像形式は ${ALLOWED_IMAGE_TYPES.join(" / ")} のいずれかにしてください`,
        },
        { status: 415 },
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error: "image_too_large",
          message: `画像は ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB 以下にしてください`,
        },
        { status: 413 },
      );
    }
  } else if (kind === "splat") {
    const lower = file.name.toLowerCase();
    if (!ALLOWED_SPLAT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      return NextResponse.json(
        {
          error: "bad_splat_extension",
          message: `Splat ファイルは ${ALLOWED_SPLAT_EXTENSIONS.join(" / ")} のいずれかにしてください`,
        },
        { status: 415 },
      );
    }
    if (file.size > MAX_SPLAT_BYTES) {
      return NextResponse.json(
        {
          error: "splat_too_large",
          message: `Splat は ${(MAX_SPLAT_BYTES / 1024 / 1024 / 1024).toFixed(0)} GB 以下にしてください`,
        },
        { status: 413 },
      );
    }
  } else {
    return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  }

  try {
    const result = await handleUpload(propertyId, file);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[upload]", e);
    return NextResponse.json(
      { error: "upload_failed", message: String(e instanceof Error ? e.message : e) },
      { status: 500 },
    );
  }
}

// Allow up to 1 GB uploads through the route (Next default would cap earlier).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
