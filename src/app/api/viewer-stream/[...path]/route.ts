import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { canViewBackyard, canViewNdaOnly } from "@/lib/account-schema";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

/** 保存済みURL（絶対URL / 相対 /api/r2/... ...）から R2 オブジェクトキーを導く。
 *  /api/viewer-asset の toR2Key と同一ロジック（キー突合のため揃える必要がある）。 */
function toR2Key(url: string): string | null {
  if (!url) return null;
  let path = url;
  if (/^https?:\/\//.test(url)) {
    try {
      path = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/+/, "").replace(/^api\/r2\//, "");
  return path || null;
}

// Formats the offline viewer can actually load (mirrors the dropzone accept list:
// .splat,.ply,.spz,.ksplat,.rad,.sog,.pcsogs,.pcsogszip,.obj,.gltf,.glb,.fbx,.zip,.json).
// The original list omitted .zip et al, so every ZIP-packaged scene 403'd here and the
// viewer fell back to the blank dropzone. This route is already gated by auth + viewer
// access, so widening the extension allowlist to the viewer's real set is safe.
const ALLOWED_RE =
  /\.(splat|ply|spz|ksplat|rad|sog|pcsogs|pcsogszip|obj|gltf|glb|fbx|zip|json)$/i;

function toR2Range(header: string): { offset: number; length: number } | { suffix: number } | null {
  const m1 = header.match(/^bytes=(\d+)-(\d+)$/);
  if (m1) return { offset: parseInt(m1[1], 10), length: parseInt(m1[2], 10) - parseInt(m1[1], 10) + 1 };
  const m2 = header.match(/^bytes=(\d+)-$/);
  if (m2) return { offset: parseInt(m2[1], 10), length: 1024 * 1024 * 16 };
  const m3 = header.match(/^bytes=-(\d+)$/);
  if (m3) return { suffix: parseInt(m3[1], 10) };
  return null;
}

async function getBucket(): Promise<AnyBucket> {
  const { env } = await getCloudflareContext();
  return (env as Record<string, unknown>).R2_ASSETS;
}

/**
 * Authenticated R2 streaming proxy for 3DGS assets.
 * Same-origin Range requests — avoids cross-origin presigned URL issues with Spark paged loader.
 * Auth: Clerk → viewer access check (admin / paid / free period).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");

  if (!ALLOWED_RE.test(key)) {
    return NextResponse.json({ error: "Not a 3DGS asset" }, { status: 403 });
  }

  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());

  if (!user && !freeAccess) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const hasAccess = freeAccess || (!!user && (user.role === "admin" || (!!user.plan && user.plan !== "free")));
  if (!hasAccess) {
    return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 });
  }

  // サブスクプラン単位のチェックだけでは、物件ごとの制限あり/NDA限定
  // splatItem まで防げない（/api/viewer-asset は元々ここまでチェックしている）。
  // この route は管理画面のキャプチャ/差し替えフローからも使われるため、admin は
  // canViewBackyard/canViewNdaOnly で常に通る（下の関数を参照）。
  const props = await propertyRepo.list();
  let matchedItem: (typeof props)[number]["splatItems"][number] | null = null;
  for (const p of props) {
    for (const item of p.splatItems) {
      if (item.splatUrl && toR2Key(item.splatUrl) === key) {
        matchedItem = item;
        break;
      }
    }
    if (matchedItem) break;
  }
  if (matchedItem) {
    if (matchedItem.accessLevel === "restricted" && !canViewBackyard(user)) {
      return NextResponse.json({ error: "制限付きデータです" }, { status: 403 });
    }
    if (matchedItem.accessLevel === "nda_only" && !canViewNdaOnly(user)) {
      return NextResponse.json({ error: "NDA限定データです" }, { status: 403 });
    }
  }

  try {
    const bucket = await getBucket();
    if (!bucket) {
      return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
    }

    const rangeHeader = req.headers.get("range");

    if (rangeHeader) {
      const r2range = toR2Range(rangeHeader);
      if (!r2range) {
        return new NextResponse("Bad Range", { status: 400 });
      }
      const obj = await bucket.get(key, { range: r2range });
      if (!obj) return new NextResponse("Not found", { status: 404 });

      const total = obj.size;
      const offset = obj.range?.offset ?? 0;
      const length = obj.range?.length ?? (await obj.arrayBuffer()).byteLength;
      const end = offset + length - 1;

      const headers = new Headers();
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Length", String(length));
      headers.set("Content-Range", `bytes ${offset}-${end}/${total}`);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "no-store");

      return new NextResponse(obj.body as ReadableStream, { status: 206, headers });
    }

    const obj = await bucket.get(key);
    if (!obj) return new NextResponse("Not found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    if (obj.size) headers.set("Content-Length", String(obj.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new NextResponse(obj.body as ReadableStream, { headers });
  } catch (e) {
    console.error("viewer-stream error:", e);
    return NextResponse.json({ error: "stream failed" }, { status: 500 });
  }
}
