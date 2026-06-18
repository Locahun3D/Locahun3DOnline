import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import type { AssetKind } from "@/lib/asset-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const kind: AssetKind | undefined =
    kindParam === "image" || kindParam === "splat" ? kindParam : undefined;
  const assets = (await assetRepo.list({ kind })).filter((a) => a.status === "ready");
  return NextResponse.json({ assets });
}
