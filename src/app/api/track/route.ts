import { NextResponse } from "next/server";
import { track } from "@/lib/analytics";
import { repo } from "@/lib/store";

/**
 * Public beacon endpoint. Client components POST a view / viewer-open event
 * here; we validate the property exists, then record it. No auth (anonymous
 * traffic is the point), but unknown property ids are rejected.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      propertyId?: string;
      type?: string;
      referrer?: string;
    };
    const propertyId = String(body.propertyId ?? "").slice(0, 64);
    const type = body.type === "viewer_open" ? "viewer_open" : "view";
    const referrer = String(body.referrer ?? "").slice(0, 500);
    if (!propertyId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const exists = await repo.get(propertyId);
    if (!exists) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
    const day = new Date().toISOString().slice(0, 10);
    await track(propertyId, type, referrer, day);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
