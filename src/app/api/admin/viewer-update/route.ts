import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { VIEWER_PATH, VIEWER_GITHUB } from "@/lib/viewer";

export const dynamic = "force-dynamic";

function extractLocalVersion(html: string): string {
  const m = html.match(/id="tb-version"[^>]*>v?\s*([\d.]+[-\w]*)/);
  return m ? m[1] : "unknown";
}

// GET = check for updates (compare local vs GitHub)
export async function GET() {
  await requireAdmin();

  let localVersion = "unknown";
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "";
    if (origin) {
      const res = await fetch(`${origin}${VIEWER_PATH}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const html = await res.text();
        localVersion = extractLocalVersion(html);
      }
    }
  } catch {
    // viewer file missing or fetch failed
  }

  let remoteVersion = "unknown";
  let notes = "";
  try {
    const res = await fetch(VIEWER_GITHUB.versionUrl, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { version?: string; notes?: string };
      remoteVersion = data.version ?? "unknown";
      notes = data.notes ?? "";
    }
  } catch {
    return NextResponse.json(
      { error: "fetch_failed", message: "GitHub に接続できませんでした" },
      { status: 502 },
    );
  }

  const updateAvailable = remoteVersion !== "unknown" && remoteVersion !== localVersion;

  return NextResponse.json({ localVersion, remoteVersion, updateAvailable, notes });
}

// POST = download viewer from GitHub and return it for manual deployment
export async function POST() {
  await requireAdmin();

  try {
    const res = await fetch(VIEWER_GITHUB.htmlUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "download_failed", message: `GitHub download failed (${res.status})` },
        { status: 502 },
      );
    }
    const html = await res.text();
    const newVersion = extractLocalVersion(html);

    return NextResponse.json({
      ok: true,
      version: newVersion,
      message:
        "Cloudflare Workers では自動ファイル書込みができません。" +
        "GitHub リポジトリの最新版をプルし、再デプロイしてください。" +
        "\n\ngit pull origin main && npx @opennextjs/cloudflare build && npx wrangler deploy",
      manualRequired: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "update_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
