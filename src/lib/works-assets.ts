import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { canAccessLocalFs } from "@/lib/fs-safe";

/**
 * works の静的メディア配信。
 *
 *   /works/images/**  → R2 キー `works/images/**`
 *   /works/videos/**  → R2 キー `works/videos/**`
 *   /assets/**        → R2 キー `assets/**`
 *
 * ⚠ URL は1文字も変えない（本人指示 2026-08-16、X 共有済みの記事から参照される）。
 *   マーケサイトでは静的アセットとして配っていたものを、統合後は同じ URL で
 *   R2 から出す。中身は不変（同じファイルを別エージェントが R2 へ投入済み）。
 *
 * dev（`next dev`）には R2 バインディングが無いので、取り込み元リポジトリ
 * (../digiroke3d_Web) のファイルをそのまま返す。本番では絶対にこの経路に
 * 落ちない（Workers には書き込み可能なFSが無く canAccessLocalFs() が false）。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

const CT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  pdf: "application/pdf",
};

function contentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CT[ext] ?? "application/octet-stream";
}

/** 記事から参照されるのは静的メディアだけ。1年 immutable で配る。 */
const CACHE = "public, max-age=31536000, immutable";

/**
 * パストラバーサル対策。`..`・空セグメント・バックスラッシュ・制御文字を弾く。
 * 正常なキーはそのまま返し、危険なら null。
 */
export function safeAssetKey(prefix: string, segments: string[]): string | null {
  if (!segments.length) return null;
  for (const s of segments) {
    if (!s || s === "." || s === "..") return null;
    if (s.includes("\\") || s.includes("\0") || s.includes("/")) return null;
  }
  return `${prefix}/${segments.join("/")}`;
}

function toR2Range(
  header: string,
): { offset: number; length?: number } | { suffix: number } | null {
  const m1 = header.match(/^bytes=(\d+)-(\d+)$/);
  if (m1) {
    const start = parseInt(m1[1], 10);
    const end = parseInt(m1[2], 10);
    if (end < start) return null;
    return { offset: start, length: end - start + 1 };
  }
  const m2 = header.match(/^bytes=(\d+)-$/);
  if (m2) return { offset: parseInt(m2[1], 10) };
  const m3 = header.match(/^bytes=-(\d+)$/);
  if (m3) return { suffix: parseInt(m3[1], 10) };
  return null;
}

async function getBucket(): Promise<AnyBucket> {
  try {
    const { env } = await getCloudflareContext();
    return (env as Record<string, unknown>).R2_ASSETS;
  } catch {
    return null;
  }
}

/** dev 用。取り込み元リポジトリの実ファイルを返す。 */
async function serveFromLocalFs(key: string, rangeHeader: string | null): Promise<Response | null> {
  if (!canAccessLocalFs()) return null;
  try {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    // works/images/x.jpg → ../digiroke3d_Web/works/images/x.jpg
    // assets/x.jpg       → ../digiroke3d_Web/assets/x.jpg
    const file = path.resolve(process.cwd(), "../digiroke3d_Web", key);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) return null;
    const buf = await fs.readFile(file);
    const total = buf.byteLength;
    const headers = new Headers({
      "content-type": contentType(key),
      "cache-control": "public, max-age=60",
      "accept-ranges": "bytes",
    });
    if (rangeHeader) {
      const r = toR2Range(rangeHeader);
      if (!r) return new Response("Bad Range", { status: 416 });
      const start = "suffix" in r ? Math.max(0, total - r.suffix) : r.offset;
      const end = "suffix" in r ? total - 1 : Math.min(total - 1, start + (r.length ?? total) - 1);
      if (start >= total) return new Response("Bad Range", { status: 416 });
      const slice = buf.subarray(start, end + 1);
      headers.set("content-length", String(slice.byteLength));
      headers.set("content-range", `bytes ${start}-${end}/${total}`);
      return new Response(new Uint8Array(slice), { status: 206, headers });
    }
    headers.set("content-length", String(total));
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return null;
  }
}

/**
 * R2（本番）→ ローカルFS（dev）の順で配る。存在しなければ 404。
 * 動画は Range 必須なので 206 を返せるようにしてある
 * （Safari は Range に応じないソースを再生しない）。
 */
export async function serveWorksAsset(key: string, req: Request): Promise<Response> {
  const rangeHeader = req.headers.get("range");
  const bucket = await getBucket();

  if (bucket) {
    try {
      if (rangeHeader) {
        const r2range = toR2Range(rangeHeader);
        if (!r2range) return new Response("Bad Range", { status: 416 });
        const obj = await bucket.get(key, { range: r2range });
        if (!obj) return new Response("Not found", { status: 404 });
        const total = obj.size as number;
        const offset = (obj.range?.offset as number | undefined) ?? 0;
        const length =
          (obj.range?.length as number | undefined) ?? Math.max(0, total - offset);
        const end = offset + length - 1;
        return new Response(obj.body as ReadableStream, {
          status: 206,
          headers: {
            "content-type": contentType(key),
            "content-length": String(length),
            "content-range": `bytes ${offset}-${end}/${total}`,
            "accept-ranges": "bytes",
            "cache-control": CACHE,
          },
        });
      }
      const obj = await bucket.get(key);
      if (!obj) return new Response("Not found", { status: 404 });
      const headers = new Headers({
        "content-type": contentType(key),
        "accept-ranges": "bytes",
        "cache-control": CACHE,
      });
      if (obj.size) headers.set("content-length", String(obj.size));
      return new Response(obj.body as ReadableStream, { headers });
    } catch {
      return new Response("asset unavailable", { status: 502 });
    }
  }

  const local = await serveFromLocalFs(key, rangeHeader);
  return local ?? new Response("Not found", { status: 404 });
}
