import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { saveLocalUpload } from "@/lib/uploads";
import { canAccessLocalFs } from "@/lib/fs-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireAdmin();

  // Workers には書き込み可能なローカルFSが無い。ここで保存しても no-op となり
  // 「ready なのに実体が無い幽霊アセット」を生むため、明示的に弾く。
  // 本番は UPLOAD_MODE=r2（presign 直PUT）を使うこと。
  if (!canAccessLocalFs()) {
    return NextResponse.json(
      { error: "local_upload_unavailable", message: "本番では R2 アップロード（UPLOAD_MODE=r2）を使用してください。" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }
  const id = String(form.get("id") ?? "").trim();
  const file = form.get("file");
  const width = form.get("width") ? Number(form.get("width")) : undefined;
  const height = form.get("height") ? Number(form.get("height")) : undefined;
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const pending = await assetRepo.get(id);
  if (!pending) return NextResponse.json({ error: "unknown_asset" }, { status: 404 });

  const saved = await saveLocalUpload(id, file);
  const asset = await assetRepo.upsert({
    ...pending,
    status: "ready",
    url: saved.url,
    size: saved.size,
    contentType: saved.contentType,
    width,
    height,
  });
  return NextResponse.json({ ok: true, asset });
}
