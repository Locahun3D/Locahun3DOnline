import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { UPLOAD_MODE, createPresignedUpload } from "@/lib/uploads";
import {
  buildAssetKey,
  validateUploadMeta,
  extOf,
  type AssetKind,
} from "@/lib/asset-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireAdmin();

  let body: {
    kind?: string;
    filename?: string;
    contentType?: string;
    size?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const kind = body.kind === "splat" ? "splat" : body.kind === "zip" ? "zip" : body.kind === "document" ? "document" : "image";
  const filename = String(body.filename ?? "").trim();
  const contentType = String(body.contentType ?? "application/octet-stream");
  const size = Number(body.size ?? 0);
  if (!filename) {
    return NextResponse.json({ error: "no_filename" }, { status: 400 });
  }

  const v = validateUploadMeta({ kind: kind as AssetKind, filename, contentType, size });
  if (!v.ok) {
    return NextResponse.json({ error: v.error, message: v.message }, { status: v.status });
  }

  const id = nanoid(10);
  const ext = extOf(filename);
  const r2Key = buildAssetKey({ kind: kind as AssetKind, id, filename });
  const stem = filename.slice(0, filename.length - ext.length);

  if (UPLOAD_MODE === "r2") {
    const { putUrl, publicUrl } = await createPresignedUpload({ r2Key, contentType });
    await assetRepo.upsert({
      id,
      kind: kind as AssetKind,
      status: "uploading",
      label: stem || filename,
      filename,
      ext,
      r2Key,
      url: publicUrl,
      size,
      contentType,
      uploadedAt: new Date().toISOString(),
    });
    return NextResponse.json({ id, mode: "r2", putUrl, url: publicUrl, contentType });
  }

  // local mode — bytes go to /api/admin/assets/local next
  await assetRepo.upsert({
    id,
    kind: kind as AssetKind,
    status: "uploading",
    label: stem || filename,
    filename,
    ext,
    r2Key, // unused in local but kept for shape
    url: "",
    size,
    contentType,
    uploadedAt: new Date().toISOString(),
  });
  return NextResponse.json({ id, mode: "local", postUrl: "/api/admin/assets/local" });
}
