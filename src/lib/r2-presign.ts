/**
 * R2 署名付き GET URL の発行（ビューアー用 3DGS アセットを R2 から直接配信する）。
 * 認証情報（R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY）が未設定なら
 * null を返し、呼び出し側は従来の Worker 経由 (/uploads → /api/r2) にフォールバックする。
 */
import "server-only";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function cfg() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || "locahun3d-assets";
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/** 署名URL発行に必要な認証情報が揃っているか。 */
export function presignConfigured(): boolean {
  return !!cfg();
}

let _client: S3Client | null = null;

/**
 * 指定キーの短命な署名付きGET URLを返す（R2 S3エンドポイント直）。
 * 未設定・失敗時は null。
 */
export async function presignViewerAsset(
  key: string,
  ttlSeconds = 3600,
): Promise<string | null> {
  const c = cfg();
  if (!c || !key) return null;
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      },
    });
  }
  try {
    return await getSignedUrl(
      _client,
      new GetObjectCommand({ Bucket: c.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  } catch {
    return null;
  }
}
