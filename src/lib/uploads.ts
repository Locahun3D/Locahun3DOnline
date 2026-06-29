/**
 * Upload abstraction.
 *  - UPLOAD_MODE=local : bytes written under public/uploads (dev, no creds).
 *  - UPLOAD_MODE=r2    : presigned PUT URLs against Cloudflare R2 (browser PUTs direct).
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile } from "./fs-safe";
import { nanoid } from "nanoid";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { safeName, buildPublicUrl } from "./asset-keys";

export {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_SPLAT_EXTENSIONS,
  MAX_IMAGE_BYTES,
  MAX_SPLAT_BYTES,
} from "./asset-keys";

export type UploadMode = "local" | "r2";

// Cloudflare Workers (compat 2025-04-01 + nodejs_compat) only populates
// process.env DURING a request — a module-top-level `process.env.X` read comes
// back empty, so a top-level const resolves WRONG on Workers (UPLOAD_MODE fell
// to "local", R2 creds went undefined → presign always fell back to the binding
// upload, capped at ~100MB). Read bindings via getCloudflareContext().env at
// call time, with process.env as the dev fallback (mirrors ai-summary.ts).
async function readEnv(name: string): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext();
    const v = (env as Record<string, unknown>)[name];
    if (typeof v === "string" && v) return v;
  } catch {
    /* not on Workers (npm run dev) */
  }
  return process.env[name];
}

export async function getUploadMode(): Promise<UploadMode> {
  return (await readEnv("UPLOAD_MODE")) === "r2" ? "r2" : "local";
}

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOADS_ROOT = "/uploads";

export interface SaveResult {
  url: string;
  size: number;
  contentType: string;
  width?: number;
  height?: number;
}

// ── Local mode ──
export async function saveLocalUpload(
  bucketId: string,
  file: File,
): Promise<SaveResult> {
  const id = safeName(bucketId);
  const dir = path.join(PUBLIC_DIR, "uploads", id);
  const ext = path.extname(file.name);
  const stem = path.basename(file.name, ext);
  const filename = `${nanoid(6)}-${safeName(stem)}${ext.toLowerCase()}`;
  const abs = path.join(dir, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await safeWriteFile(abs, buf);
  return {
    url: `${UPLOADS_ROOT}/${id}/${filename}`,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  };
}

// Legacy single-call upload (still used by /api/admin/upload until fully migrated).
export async function handleUpload(
  propertyId: string,
  file: File,
): Promise<SaveResult> {
  if ((await getUploadMode()) === "r2") {
    throw new Error(
      "handleUpload(local) called while UPLOAD_MODE=r2 — use the assets presign flow.",
    );
  }
  return saveLocalUpload(propertyId, file);
}

// ── R2 mode ──
async function r2Env() {
  const [accountId, accessKeyId, secretAccessKey, bucket, publicBase] =
    await Promise.all([
      readEnv("R2_ACCOUNT_ID"),
      readEnv("R2_ACCESS_KEY_ID"),
      readEnv("R2_SECRET_ACCESS_KEY"),
      readEnv("R2_BUCKET"),
      readEnv("R2_PUBLIC_URL"),
    ]);
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    throw new Error(
      "R2 env not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_URL).",
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

let _client: S3Client | null = null;
async function r2Client(): Promise<{ client: S3Client; bucket: string; publicBase: string }> {
  const env = await r2Env();
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    });
  }
  return { client: _client, bucket: env.bucket, publicBase: env.publicBase };
}

/** Presigned PUT URL the browser uploads to directly. */
export async function createPresignedUpload(input: {
  r2Key: string;
  contentType: string;
}): Promise<{ putUrl: string; publicUrl: string }> {
  const { client, bucket, publicBase } = await r2Client();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: input.r2Key,
    ContentType: input.contentType,
  });
  const putUrl = await getSignedUrl(client, cmd, { expiresIn: 600 });
  return { putUrl, publicUrl: buildPublicUrl(input.r2Key, publicBase) };
}

export async function deleteR2Object(r2Key: string): Promise<void> {
  const { client, bucket } = await r2Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: r2Key }));
}

export async function r2PublicUrlFor(r2Key: string): Promise<string> {
  return buildPublicUrl(r2Key, (await r2Env()).publicBase);
}
