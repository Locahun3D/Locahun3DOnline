import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { suggestLocation, type LocationSuggestInput } from "@/lib/ai-location";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await requireAdmin();

  let body: Partial<LocationSuggestInput>;
  try {
    body = (await req.json()) as Partial<LocationSuggestInput>;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const input: LocationSuggestInput = {
    title: String(body.title ?? ""),
    category: String(body.category ?? "other"),
    studioType: String(body.studioType ?? ""),
    prefecture: String(body.prefecture ?? ""),
    city: String(body.city ?? ""),
    area: String(body.area ?? ""),
    contactWebsite: String(body.contactWebsite ?? ""),
  };

  const result = await suggestLocation(input);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json(result);
}
