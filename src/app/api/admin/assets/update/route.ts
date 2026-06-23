import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { canAccessLocalFs } from "@/lib/fs-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!canAccessLocalFs()) {
    return NextResponse.json({ ok: true, skipped: "no_writable_fs" });
  }
  await requireAdmin();

  let body: { action?: string; id?: string; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { action, id } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  if (action === "rename") {
    const label = String(body.label ?? "").slice(0, 120);
    const a = await assetRepo.get(id);
    if (!a) return NextResponse.json({ ok: false, reason: "not_found" });
    await assetRepo.upsert({ ...a, label });
    return NextResponse.json({ ok: true });
  }

  if (action === "tags") {
    const tags = (Array.isArray(body.tags) ? body.tags : [])
      .map((t: unknown) => String(t).trim().slice(0, 40))
      .filter(Boolean);
    const a = await assetRepo.get(id);
    if (!a) return NextResponse.json({ ok: false, reason: "not_found" });
    await assetRepo.upsert({ ...a, tags: [...new Set(tags)] });
    return NextResponse.json({ ok: true });
  }

  if (action === "thumbnail") {
    const thumbnailUrl = String(body.thumbnailUrl ?? "");
    const a = await assetRepo.get(id);
    if (!a) return NextResponse.json({ ok: false, reason: "not_found" });
    await assetRepo.upsert({ ...a, thumbnailUrl });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const a = await assetRepo.get(id);
    if (!a) return NextResponse.json({ ok: false, reason: "not_found" });
    await assetRepo.remove(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
