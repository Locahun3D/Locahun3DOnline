import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { getR2Bucket } from "@/lib/r2-store";
import { buildPublicUrl } from "@/lib/asset-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R2 バケットバインディング (env.R2_ASSETS) 経由でファイルを保存する。
 * S3 署名アップロード用のシークレット（R2_ACCESS_KEY_ID 等）が未設定でも、
 * Worker にバインド済みの R2 バケットへ直接 put できるためアップロードが成立する。
 * presign が creds 不足で失敗したとき (mode:"binding") のフォールバック経路。
 * 注: リクエストボディが Worker を通るため大容量(GB級)には不向き。画像/小ファイル向け。
 */
async function r2PublicBase(): Promise<string | null> {
  try {
    const { env } = await getCloudflareContext();
    const v = (env as Record<string, unknown>).R2_PUBLIC_URL;
    if (typeof v === "string" && v) return v;
  } catch {
    /* not on Workers */
  }
  return process.env.R2_PUBLIC_URL || null;
}

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

  const bucket = await getR2Bucket();
  if (!bucket) {
    return NextResponse.json({ error: "r2_unavailable" }, { status: 503 });
  }

  const publicBase = await r2PublicBase();
  if (!publicBase) {
    return NextResponse.json(
      { error: "R2_PUBLIC_URL_missing" },
      { status: 500 },
    );
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
    url: buildPublicUrl(pending.r2Key, publicBase),
    width,
    height,
  });

  return NextResponse.json({ ok: true, asset });
}
