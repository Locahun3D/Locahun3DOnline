import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { getR2Bucket } from "@/lib/r2-store";
import { buildPublicUrl, validateUploadMeta } from "@/lib/asset-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// バインディング経由はリクエストボディを Worker メモリに全載せするため、GB級は
// OOM する。バインディング fallback は小ファイル専用とし、これを超える場合は
// presign（ブラウザ→R2 直 PUT）経路を使わせる。
const MAX_BINDING_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * R2 バケットバインディング (env.R2_ASSETS) 経由でファイルを保存する。
 * S3 署名アップロード用のシークレット（R2_ACCESS_KEY_ID 等）が未設定でも、
 * Worker にバインド済みの R2 バケットへ直接 put できるためアップロードが成立する。
 * presign が creds 不足で失敗したとき (mode:"binding") のフォールバック経路。
 * 注: リクエストボディが Worker を通るため大容量(GB級)には不向き。画像/小ファイル向け。
 */
export async function POST(req: Request) {
  await requireAdmin();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const id = String(form.get("id") ?? "").trim();
  const file = form.get("file");
  if (!id || !(file instanceof File)) {
    return NextResponse.json({ error: "bad_input" }, { status: 400 });
  }

  const pending = await assetRepo.get(id);
  if (!pending) {
    return NextResponse.json({ error: "unknown_asset" }, { status: 404 });
  }

  // 種類・形式・サイズを put 前に検証（不正な巨大/異種ファイルでの OOM・汚染を防ぐ）。
  const check = validateUploadMeta({
    kind: pending.kind,
    filename: file.name,
    contentType: file.type || pending.contentType,
    size: file.size,
  });
  if (!check.ok) {
    return NextResponse.json(
      { error: check.error, message: check.message },
      { status: check.status },
    );
  }
  if (file.size > MAX_BINDING_BYTES) {
    return NextResponse.json(
      {
        error: "too_large_for_binding",
        message: `${(MAX_BINDING_BYTES / 1024 / 1024).toFixed(0)} MB を超えるファイルは直アップロード(presign)経路を使用してください`,
      },
      { status: 413 },
    );
  }

  const bucket = await getR2Bucket();
  if (!bucket) {
    return NextResponse.json({ error: "r2_unavailable" }, { status: 503 });
  }

  try {
    const buf = await file.arrayBuffer();
    await bucket.put(pending.r2Key, buf, {
      httpMetadata: {
        contentType: pending.contentType || file.type || "application/octet-stream",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "put_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const width = Number(form.get("width")) || pending.width;
  const height = Number(form.get("height")) || pending.height;
  const asset = await assetRepo.upsert({
    ...pending,
    status: "ready",
    url: buildPublicUrl(pending.r2Key),
    width,
    height,
  });

  return NextResponse.json({ ok: true, asset });
}
