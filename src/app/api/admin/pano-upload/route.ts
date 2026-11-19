import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser } from "@/lib/dal";

/**
 * 管理画面から撮った「開始位置の 360° 画像」（6 方向・各 90°）を R2 に置く（2026-11-19 本人「360画像一枚キャプチャして、それが回っている表示に」）。
 * プレビュー動画の代わり。カード（pano-preview.tsx）とビューアー（292b_start_pano.js）が同じ画像を使う。
 *
 * - 置き場所とキーは scripts/bake-pano.mjs と同じ: pano/<key>-{f,r,b,l,u,d}.jpg と最後に pano/<key>.json。
 *   key = sha256('l3d-pano-v1:etag:<シーンZIPの R2 ETag>:<長さ>')。/api/viewer-stream が ZIP に付ける ETag・長さと同じなので、
 *   カード・ビューアーが計算するキーと一致する。キーはサーバーが R2 から決める（送られてきた値は使わない）。
 * - 既にあるキーは上書きしない（画像は 1 年キャッシュされるので、書き換えても古いものが見え続ける）。シーンを差し替えればキーが変わる。
 * - GET ?splatUrl= で、そのシーンの画像があるかを返す（管理画面の「360° あり／なし」と自動撮影の判定）。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FACES = ["f", "r", "b", "l", "u", "d"] as const;
const MAX_FACE_BYTES = 3_000_000;

type R2Obj = { size: number; httpEtag: string };
type Bucket = {
  head(key: string): Promise<R2Obj | null>;
  put(key: string, value: ArrayBuffer | string, opts?: Record<string, unknown>): Promise<unknown>;
};

async function bucket(): Promise<Bucket> {
  const { env } = await getCloudflareContext();
  return (env as Record<string, unknown>).R2_ASSETS as Bucket;
}

/** /api/r2/<key> ・ /api/viewer-stream/<key> ・ <key> のどれでも R2 のキーにする。ZIP だけを対象にする。 */
function sceneKey(splatUrl: string): string | null {
  const k = splatUrl.trim().split(/[?#]/)[0].replace(/^\/+/, "").replace(/^api\/(r2|viewer-stream)\//, "");
  if (!k || k.includes("..") || /^https?:/i.test(k) || !/\.zip$/i.test(k)) return null;
  return decodeURIComponent(k);
}

async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

async function panoKeyFor(b: Bucket, splatUrl: string): Promise<string | null> {
  const k = sceneKey(splatUrl);
  if (!k) return null;
  const head = await b.head(k);
  if (!head) return null;
  const etag = /^"?([A-Za-z0-9_-]{8,200})"?$/.exec(head.httpEtag || "")?.[1];
  if (!etag || !Number.isSafeInteger(head.size)) return null;
  return sha256hex(`l3d-pano-v1:etag:${etag}:${head.size}`);
}

async function requireAdmin() {
  const user = await getCurrentUser();
  return !!user && user.role === "admin";
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const splatUrl = new URL(req.url).searchParams.get("splatUrl") || "";
  const b = await bucket();
  const key = await panoKeyFor(b, splatUrl);
  if (!key) return NextResponse.json({ key: null, exists: false, supported: false }, { headers: { "Cache-Control": "no-store" } });
  const exists = !!(await b.head(`pano/${key}.json`));
  return NextResponse.json({ key, exists, supported: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }
  const splatUrl = String(form.get("splatUrl") ?? "");
  let pose: { x: number; y: number; z: number; yaw: number; pitch: number };
  try {
    pose = JSON.parse(String(form.get("pose") ?? ""));
  } catch {
    return NextResponse.json({ error: "bad_pose" }, { status: 400 });
  }
  if (![pose?.x, pose?.y, pose?.z, pose?.yaw, pose?.pitch].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return NextResponse.json({ error: "bad_pose" }, { status: 400 });
  }
  const size = Math.round(Number(form.get("size")) || 1024);

  const faces: Record<string, ArrayBuffer> = {};
  for (const f of FACES) {
    const file = form.get(f);
    if (!(file instanceof File) || file.size <= 0 || file.size > MAX_FACE_BYTES) {
      return NextResponse.json({ error: `bad_face_${f}` }, { status: 400 });
    }
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf, 0, 3);
    if (u8[0] !== 0xff || u8[1] !== 0xd8 || u8[2] !== 0xff) return NextResponse.json({ error: `not_jpeg_${f}` }, { status: 400 });
    faces[f] = buf;
  }

  const b = await bucket();
  const key = await panoKeyFor(b, splatUrl);
  if (!key) return NextResponse.json({ error: "unsupported_scene" }, { status: 400 });
  if (await b.head(`pano/${key}.json`)) return NextResponse.json({ key, existed: true });

  const faceSha: Record<string, string> = {};
  for (const f of FACES) {
    const d = await crypto.subtle.digest("SHA-256", faces[f]);
    faceSha[f] = [...new Uint8Array(d)].map((n) => n.toString(16).padStart(2, "0")).join("");
    await b.put(`pano/${key}-${f}.jpg`, faces[f], { httpMetadata: { contentType: "image/jpeg" } });
  }
  const meta = {
    v: 1,
    pos: { x: pose.x, y: pose.y, z: pose.z },
    yaw: pose.yaw,
    pitch: pose.pitch,
    size,
    bakedAt: new Date().toISOString(),
    scene: splatUrl,
    by: "admin-capture",
    faces: faceSha,
  };
  // 最後に置く（これがあれば使われる）
  await b.put(`pano/${key}.json`, JSON.stringify(meta), { httpMetadata: { contentType: "application/json" } });
  return NextResponse.json({ key, existed: false });
}
