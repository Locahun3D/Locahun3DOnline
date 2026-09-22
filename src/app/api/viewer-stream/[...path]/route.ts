import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { canViewBackyard, canViewNdaOnly } from "@/lib/account-schema";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";
import { viewerStreamTokenGrant } from "@/lib/viewer-stream-grant";
import { readStoredRadEntry, mapRangeIntoEntry } from "@/lib/zip-stored-entry";
import { streamContentEtag } from "@/lib/stream-content-etag";

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
  let key = path.join("/");
  // ?ref=stream: 参照保存のアーカイブ（編集後の .zip）が指す「元のRAD」を返す（2026-09-21）。
  // どのファイルを返すかはサーバーが物件データから決める。クライアントからキーは受け取らない。
  const wantsStream = req.nextUrl.searchParams.get("ref") === "stream";

  if (!ALLOWED_RE.test(key)) {
    return NextResponse.json({ error: "Not a 3DGS asset" }, { status: 403 });
  }

  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());

  // 共有・埋め込み・限定プレビューのトークンで許された視聴（2026-09-21）。
  // これらは /api/viewer-asset で既に「ログイン不要で見せてよい」と判断している経路。
  // 参照保存のシーンは本体を ?ref=stream から読むので、同じ根拠でここも通さないと、
  // 埋め込み先や共有リンクで 3D が出ない（本番で発生）。物件の一致は下の照合で必ず見る。
  const q = req.nextUrl.searchParams;
  const grant = await viewerStreamTokenGrant({
    preview: q.get("preview") || "",
    embed: q.get("embed") || "",
    share: q.get("share") || "",
  });

  if (!user && !freeAccess && !grant) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const hasAccess = !!grant || freeAccess
    || (!!user && (user.role === "admin" || (!!user.plan && user.plan !== "free")));
  if (!hasAccess) {
    return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 });
  }

  // サブスクプラン単位のチェックだけでは、物件ごとの制限あり/NDA限定
  // splatItem まで防げない（/api/viewer-asset は元々ここまでチェックしている）。
  // この route は管理画面のキャプチャ/差し替えフローからも使われるため、admin は
  // canViewBackyard/canViewNdaOnly で常に通る（下の関数を参照）。
  const props = await propertyRepo.list();
  let matchedItem: (typeof props)[number]["splatItems"][number] | null = null;
  let matchedProperty: (typeof props)[number] | null = null;
  for (const p of props) {
    for (const item of p.splatItems) {
      // 参照元の RAD を直接指された場合も、同じシーンの公開範囲（制限あり／NDA限定）を当てる。
      if (
        (item.splatUrl && toR2Key(item.splatUrl) === key) ||
        (!wantsStream && item.streamUrl && toR2Key(item.streamUrl) === key)
      ) {
        matchedItem = item;
        matchedProperty = p;
        break;
      }
    }
    if (matchedItem) break;
  }
  if (wantsStream) {
    const streamKey = matchedItem?.streamUrl ? toR2Key(matchedItem.streamUrl) : null;
    if (!streamKey || !ALLOWED_RE.test(streamKey)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    key = streamKey;
  }
  // トークンで来た場合は、そのトークンが指す物件のファイルに限る（他物件は読ませない）。
  if (grant && matchedProperty?.id !== grant.propertyId) {
    return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 });
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

    // ?ref=stream で行き着いた先が ZIP のときは、**中に無圧縮で入っている .rad の部分だけ**を返す。
    // ⚠ 2026-09-21 本番で確認: ここでキーを差し替えるだけだと ZIP 全体が流れ、
    //    ビューアーが「Invalid RAD magic: 0x04034b50」（＝ZIPの先頭）で止まる。
    //    位置の割り出しは scene-edit の配信と同じ手順（lib/zip-stored-entry.ts）。
    if (wantsStream && /\.zip$/i.test(key)) {
      // 当たり判定キャッシュの識別用に、中身だけで決まる ETag を返す（lib/stream-content-etag.ts）。
      let objectEtag = "";
      const entry = await readStoredRadEntry(async (offset, length) => {
        const head = await bucket.get(key, { range: { offset, length } });
        if (!head?.body) return null;
        if (head.httpEtag) objectEtag = head.httpEtag;
        return new Uint8Array(await new Response(head.body as ReadableStream).arrayBuffer());
      });
      if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const asked = rangeHeader ? toR2Range(rangeHeader) : undefined;
      if (rangeHeader && !asked) return new NextResponse("Bad Range", { status: 400 });
      const window = mapRangeIntoEntry(entry, asked ?? undefined);
      if (window.length < 1) return new NextResponse("Bad Range", { status: 416 });
      const headers = new Headers({
        "Content-Type": "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Length": String(rangeHeader ? window.length : entry.size),
        "X-Stream-Name": entry.name,
      });
      if (objectEtag) headers.set("ETag", streamContentEtag(objectEtag, entry.offset));
      if (req.method === "HEAD") return new NextResponse(null, { headers });
      const part = await bucket.get(key, { range: window });
      if (!part) return new NextResponse("Not found", { status: 404 });
      if (rangeHeader) {
        const from = window.offset - entry.offset;
        headers.set("Content-Range", `bytes ${from}-${from + window.length - 1}/${entry.size}`);
        return new NextResponse(part.body as ReadableStream, { status: 206, headers });
      }
      return new NextResponse(part.body as ReadableStream, { headers });
    }

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
      headers.set("ETag", wantsStream ? streamContentEtag(obj.httpEtag, 0) : obj.httpEtag);
      headers.set("Last-Modified", obj.uploaded.toUTCString());

      return new NextResponse(obj.body as ReadableStream, { status: 206, headers });
    }

    const obj = await (req.method === "HEAD" ? bucket.head(key) : bucket.get(key));
    if (!obj) return new NextResponse("Not found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Length", String(obj.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");
    headers.set("ETag", wantsStream ? streamContentEtag(obj.httpEtag, 0) : obj.httpEtag);
    headers.set("Last-Modified", obj.uploaded.toUTCString());

    return new NextResponse(req.method === "HEAD" ? null : obj.body as ReadableStream, { headers });
  } catch (e) {
    console.error("viewer-stream error:", e);
    return NextResponse.json({ error: "stream failed" }, { status: 500 });
  }
}

export async function HEAD(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  // HEAD must pass the same user/plan/restricted/NDA checks as GET.
  const response = await GET(req, context);
  await response.body?.cancel();
  return new NextResponse(null, { status: response.status, headers: response.headers });
}
