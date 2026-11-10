import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { toR2Key } from "@/lib/asset-keys";
import {
  VIEWER_EDIT_MAX_BYTES,
  VIEWER_EDIT_MAX_PER_SCENE,
  canSaveViewerEdits,
  deleteViewerEdit,
  listViewerEdits,
  readViewerEdit,
  saveViewerEdit,
  viewerSrcToKey,
} from "@/lib/viewer-edits";

export const dynamic = "force-dynamic";

/**
 * ビューアーの編集をアカウントに保存・一覧・呼び出し・削除する（課金プラン・管理者・スタジオ）。
 *   GET    ?src=<表示中データのURL>            → { items: [{id,name,savedAt,size}] }
 *   GET    ?src=…&id=<editId>                  → ZIP
 *   POST   ?src=…&name=<名前>  body: ZIP        → { item }
 *   DELETE ?src=…&id=<editId>                  → { ok: true }
 * src は物件のシーン（splatItem）に一致するものだけ受け付ける（任意キーの置き場にさせない）。
 */
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });

async function resolve(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { error: json({ error: "login_required" }, 401) } as const;
  if (!canSaveViewerEdits(user)) return { error: json({ error: "plan_required" }, 403) } as const;
  const url = new URL(req.url);
  const src = url.searchParams.get("src") || "";
  const key = src ? viewerSrcToKey(src.slice(0, 4000)) : null;
  if (!key) return { error: json({ error: "bad_src" }, 400) } as const;
  const props = await propertyRepo.list();
  const known = props.some((p) => p.splatItems.some((it) => it.splatUrl && toR2Key(it.splatUrl) === key));
  if (!known) return { error: json({ error: "not_found" }, 404) } as const;
  return { user, key, url } as const;
}

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return false;
  return req.headers.get("sec-fetch-site") !== "cross-site";
}

export async function GET(req: Request) {
  try {
    const r = await resolve(req);
    if ("error" in r) return r.error;
    const id = r.url.searchParams.get("id");
    if (id) {
      const bytes = await readViewerEdit(r.user.id, r.key, id);
      if (!bytes) return json({ error: "not_found" }, 404);
      return new Response(bytes as unknown as BodyInit, {
        headers: { "Content-Type": "application/zip", "Cache-Control": "no-store, private" },
      });
    }
    return json({ items: await listViewerEdits(r.user.id, r.key) });
  } catch (err) {
    console.error("[viewer-edits] GET failed:", err);
    return json({ error: "failed" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: "origin" }, 403);
    const r = await resolve(req);
    if ("error" in r) return r.error;
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > VIEWER_EDIT_MAX_BYTES) return json({ error: "too_large" }, 413);
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.byteLength > VIEWER_EDIT_MAX_BYTES) return json({ error: "too_large" }, 413);
    // ZIP の先頭（PK\x03\x04）だけ確かめる。中身の検証はビューアーが開くときに行う。
    if (buf.byteLength < 22 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
      return json({ error: "bad_zip" }, 400);
    }
    const existing = await listViewerEdits(r.user.id, r.key);
    if (existing.length >= VIEWER_EDIT_MAX_PER_SCENE) return json({ error: "limit", max: VIEWER_EDIT_MAX_PER_SCENE }, 409);
    const item = await saveViewerEdit(r.user.id, r.key, r.url.searchParams.get("name") || "", buf);
    return json({ item });
  } catch (err) {
    console.error("[viewer-edits] POST failed:", err);
    return json({ error: "failed" }, 500);
  }
}

export async function DELETE(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: "origin" }, 403);
    const r = await resolve(req);
    if ("error" in r) return r.error;
    const id = r.url.searchParams.get("id") || "";
    await deleteViewerEdit(r.user.id, r.key, id);
    return json({ ok: true });
  } catch (err) {
    console.error("[viewer-edits] DELETE failed:", err);
    return json({ error: "failed" }, 500);
  }
}
