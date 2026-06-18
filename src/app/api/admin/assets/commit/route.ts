import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireAdmin();
  let body: { id?: string; width?: number; height?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const pending = await assetRepo.get(id);
  if (!pending) return NextResponse.json({ error: "unknown_asset" }, { status: 404 });

  const asset = await assetRepo.upsert({
    ...pending,
    status: "ready",
    width: body.width ?? pending.width,
    height: body.height ?? pending.height,
  });
  return NextResponse.json({ ok: true, asset });
}
