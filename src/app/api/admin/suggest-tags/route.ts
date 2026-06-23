import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { suggestTags, type TagSuggestInput } from "@/lib/ai-tags";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await requireAdmin();

  let body: Partial<TagSuggestInput>;
  try {
    body = (await req.json()) as Partial<TagSuggestInput>;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const input: TagSuggestInput = {
    title: String(body.title ?? ""),
    category: String(body.category ?? "other"),
    studioType: String(body.studioType ?? ""),
    prefecture: String(body.prefecture ?? ""),
    city: String(body.city ?? ""),
    area: String(body.area ?? ""),
    contactWebsite: String(body.contactWebsite ?? ""),
    description: String(body.description ?? ""),
    capacity: Number(body.capacity) || 0,
    floorAreaSqm: Number(body.floorAreaSqm) || 0,
    ceilingHeightM: Number(body.ceilingHeightM) || 0,
    hasNaturalLight: !!body.hasNaturalLight,
    parking: !!body.parking,
    loadingDock: !!body.loadingDock,
    powerVoltage: String(body.powerVoltage ?? ""),
    existingTags: Array.isArray(body.existingTags)
      ? body.existingTags.filter((t): t is string => typeof t === "string")
      : [],
  };

  try {
    const result = await suggestTags(input);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
