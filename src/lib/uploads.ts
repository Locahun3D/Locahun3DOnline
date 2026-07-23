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
// @aws-sdk の署名は Cloudflare Workers 上で `fs.readFile is not implemented`
// (unenv) で落ちる → presign が毎回 binding にフォールバックし約100MB上限に
// 引っかかっていた。Workers で動く軽量 SigV4 の aws4fetch に置き換える
// (Cloudflare が R2 presign で公式に推奨)。
import { AwsClient } from "aws4fetch";
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

let _client: AwsClient | null = null;
async function r2Client(): Promise<{
  client: AwsClient;
  endpoint: string;
  bucket: string;
  publicBase: string;
}> {
  const env = await r2Env();
  if (!_client) {
    _client = new AwsClient({
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
      service: "s3",
      region: "auto",
    });
  }
  return {
    client: _client,
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    bucket: env.bucket,
    publicBase: env.publicBase,
  };
}

// オブジェクトの S3 URL。キーは "/" 区切りの各セグメントだけエンコード
// (区切りスラッシュは保持)。署名URLと配信URLでキー表現を一致させる。
function r2ObjectUrl(endpoint: string, bucket: string, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${endpoint}/${bucket}/${encodedKey}`;
}

/** Presigned PUT URL the browser uploads to directly. */
export async function createPresignedUpload(input: {
  r2Key: string;
  contentType: string;
}): Promise<{ putUrl: string; publicUrl: string }> {
  const { client, endpoint, bucket, publicBase } = await r2Client();
  const url = new URL(r2ObjectUrl(endpoint, bucket, input.r2Key));
  url.searchParams.set("X-Amz-Expires", "600");
  // signQuery=true で署名をクエリに載せた presigned URL を生成。ブラウザはこの
  // URL にそのまま PUT する。content-type は署名に含めない(ブラウザが送る任意の
  // type を許容)ことで署名不一致を避ける。
  const signed = await client.sign(url.toString(), {
    method: "PUT",
    aws: { signQuery: true },
  });
  return { putUrl: signed.url, publicUrl: buildPublicUrl(input.r2Key, publicBase) };
}

/**
 * 署名付き GET URL（ブラウザ→R2 直ダウンロード用）。
 * Worker 経由 (/api/r2) の大容量ストリームは負荷時に途中切断が実測されるため、
 * 管理画面の大容量ダウンロード（プレビューキャプチャ等）はストレージ直で読む。
 * バケット CORS は locahun3d.com からの GET/HEAD + range を許可済み。
 */
export async function createPresignedGet(
  r2Key: string,
  opts: { downloadFilename?: string } = {},
): Promise<string> {
  const { client, endpoint, bucket } = await r2Client();
  const url = new URL(r2ObjectUrl(endpoint, bucket, r2Key));
  url.searchParams.set("X-Amz-Expires", "3600");
  // response-content-disposition は S3 署名対象のクエリとして扱われ、R2 が
  // ダウンロード時にこのファイル名で保存させる（R2 の生キー＝ランダム接頭辞
  // 付きの内部ファイル名を購入者にそのまま見せないため）。
  if (opts.downloadFilename) {
    url.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${opts.downloadFilename.replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(opts.downloadFilename)}`,
    );
  }
  const signed = await client.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * R2 オブジェクトの実在確認（commit の必須ゲート）。
 * presign は「D1 に uploading 行を作ってから」ブラウザが直 PUT する構造なので、
 * PUT が失敗/中断しても D1 行だけ残る。存在確認せずに ready へ倒すと
 * 「404 する splatUrl」が正として保存されてしまう（実害発生済）。
 * Workers では R2 バインディングの head()、dev(UPLOAD_MODE=r2) では
 * S3 HEAD（aws4fetch 署名）で確認する。
 */
export async function statR2Object(
  r2Key: string,
): Promise<{ size: number } | null> {
  // 1) Workers binding（本番経路）
  try {
    const { env } = await getCloudflareContext();
    const bucket = (env as Record<string, unknown>).R2_ASSETS as
      | { head(key: string): Promise<{ size: number } | null> }
      | undefined;
    if (bucket) {
      const head = await bucket.head(r2Key);
      return head ? { size: head.size } : null;
    }
  } catch {
    /* not on Workers */
  }
  // 2) S3 HEAD（dev で UPLOAD_MODE=r2 のとき。presign と同じクレデンシャル）
  const { client, endpoint, bucket } = await r2Client();
  const res = await client.fetch(r2ObjectUrl(endpoint, bucket, r2Key), {
    method: "HEAD",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD failed (${res.status})`);
  return { size: Number(res.headers.get("content-length") ?? 0) };
}

export async function deleteR2Object(r2Key: string): Promise<void> {
  const { client, endpoint, bucket } = await r2Client();
  const res = await client.fetch(r2ObjectUrl(endpoint, bucket, r2Key), {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed (${res.status})`);
  }
}

export async function r2PublicUrlFor(r2Key: string): Promise<string> {
  return buildPublicUrl(r2Key, (await r2Env()).publicBase);
}

/**
 * 問い合わせフォーム（バグ報告）の画像添付を保存する。
 * 匿名ユーザーからの直接アップロードなので presign は使わず、サーバー側で
 * 検証済みのバイト列だけを書き込む（サイズ/種別チェックは呼び出し側で実施）。
 *  - local: public/uploads/contact-<id>/ へ保存
 *  - r2   : contact/<id>/ キーへ保存（Workers binding 優先、dev は S3 PUT）
 * 返り値の url は /api/r2/... または /uploads/...（admin 画面・通知メールで使用）。
 */
export async function saveContactAttachment(
  contactId: string,
  file: File,
): Promise<{ url: string }> {
  if ((await getUploadMode()) !== "r2") {
    const saved = await saveLocalUpload(`contact-${contactId}`, file);
    return { url: saved.url };
  }

  const ext = path.extname(file.name).toLowerCase();
  const stem = path.basename(file.name, path.extname(file.name));
  const key = `contact/${safeName(contactId)}/${nanoid(6)}-${safeName(stem)}${ext}`;
  const buf = await file.arrayBuffer();
  const contentType = file.type || "application/octet-stream";

  // 1) Workers binding（本番経路）
  try {
    const { env } = await getCloudflareContext();
    const bucket = (env as Record<string, unknown>).R2_ASSETS as
      | { put(key: string, body: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown> }
      | undefined;
    if (bucket) {
      await bucket.put(key, buf, { httpMetadata: { contentType } });
      return { url: buildPublicUrl(key) };
    }
  } catch {
    /* not on Workers */
  }

  // 2) S3 PUT（dev で UPLOAD_MODE=r2 のとき）
  const { client, endpoint, bucket } = await r2Client();
  const res = await client.fetch(r2ObjectUrl(endpoint, bucket, key), {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buf,
  });
  if (!res.ok) throw new Error(`R2 attachment PUT failed (${res.status})`);
  return { url: buildPublicUrl(key) };
}

/**
 * 持ち込みスキャン申請（/submit-scan）のサンプル画像を保存する。
 * saveContactAttachment と同じ「匿名/軽量アップロードはサーバー側でバイト列を
 * 直接書き込む」方式（presign 不要・最大5枚・各25MBの小容量が前提）。
 * ⚠ ここに保存するのはサンプル画像のみ。フルデータ（GB級）はこの経路では
 * 扱わない（非公開預かりの安全装置 — 詳細は scan-submissions.ts 冒頭コメント）。
 *  - local: public/uploads/scan-<id>/ へ保存
 *  - r2   : scan-submissions/<id>/ キーへ保存（Workers binding 優先、dev は S3 PUT）
 */
export async function saveScanSubmissionImage(
  submissionId: string,
  file: File,
): Promise<{ url: string }> {
  if ((await getUploadMode()) !== "r2") {
    const saved = await saveLocalUpload(`scan-${submissionId}`, file);
    return { url: saved.url };
  }

  const ext = path.extname(file.name).toLowerCase();
  const stem = path.basename(file.name, path.extname(file.name));
  const key = `scan-submissions/${safeName(submissionId)}/${nanoid(6)}-${safeName(stem)}${ext}`;
  const buf = await file.arrayBuffer();
  const contentType = file.type || "application/octet-stream";

  // 1) Workers binding（本番経路）
  try {
    const { env } = await getCloudflareContext();
    const bucket = (env as Record<string, unknown>).R2_ASSETS as
      | { put(key: string, body: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown> }
      | undefined;
    if (bucket) {
      await bucket.put(key, buf, { httpMetadata: { contentType } });
      return { url: buildPublicUrl(key) };
    }
  } catch {
    /* not on Workers */
  }

  // 2) S3 PUT（dev で UPLOAD_MODE=r2 のとき）
  const { client, endpoint, bucket } = await r2Client();
  const res = await client.fetch(r2ObjectUrl(endpoint, bucket, key), {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buf,
  });
  if (!res.ok) throw new Error(`R2 scan-submission image PUT failed (${res.status})`);
  return { url: buildPublicUrl(key) };
}
