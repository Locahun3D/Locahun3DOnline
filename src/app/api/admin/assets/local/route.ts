import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { saveLocalUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
