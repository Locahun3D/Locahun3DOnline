/**
 * Upload abstraction.
 *
 * UPLOAD_MODE=local (default) — writes to public/uploads/{propertyId}/{nanoid}-{filename}.
 *   - Works without any external creds, ideal for early dev and the "form polish" phase.
 *   - Files committed via git get served by Next.js as /uploads/...
 *   - Don't use for 100s of MB of splat data — that's what R2 mode is for.
 *
 * UPLOAD_MODE=r2 — generates presigned PUT URLs against Cloudflare R2.
 *   - TODO: implement when R2 Access Key / Secret are provisioned.
 *   - Browser PUTs directly to R2, no server pipe-through.
 *   - Bucket: locahun3d-assets (existing).
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";

export type UploadMode = "local" | "r2";

export const UPLOAD_MODE: UploadMode =
  process.env.UPLOAD_MODE === "r2" ? "r2" : "local";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOADS_ROOT = "/uploads";

export interface SaveResult {
  url: string;
  size: number;
  contentType: string;
  width?: number;
  height?: number;
}

function safeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 80);
}

export async function saveLocalUpload(
  propertyId: string,
  file: File,
): Promise<SaveResult> {
  const id = safeName(propertyId);
  const dir = path.join(PUBLIC_DIR, "uploads", id);
  await fs.mkdir(dir, { recursive: true });

  const ext = path.extname(file.name);
  const stem = path.basename(file.name, ext);
  const filename = `${nanoid(6)}-${safeName(stem)}${ext.toLowerCase()}`;
  const abs = path.join(dir, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(abs, buf);

  return {
    url: `${UPLOADS_ROOT}/${id}/${filename}`,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  };
}

export async function handleUpload(
  propertyId: string,
  file: File,
): Promise<SaveResult> {
  if (UPLOAD_MODE === "r2") {
    throw new Error(
      "UPLOAD_MODE=r2 is not yet wired. Set UPLOAD_MODE=local or provision R2 keys.",
    );
  }
  return saveLocalUpload(propertyId, file);
}

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];

export const ALLOWED_SPLAT_EXTENSIONS = [".splat", ".ply", ".ksplat"];

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB per photo
export const MAX_SPLAT_BYTES = 1024 * 1024 * 1024; // 1 GB per splat
