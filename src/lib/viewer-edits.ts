import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { canAccessLocalFs } from "./fs-safe";
import { getR2Bucket } from "./r2-store";
import { isStudioPurchaseRestricted, type PublicUser } from "./account-schema";
import { toR2Key } from "./asset-keys";

/**
 * ビューアーの編集（置いたモデル・人物・注釈・経路・視点）をアカウントに保存して呼び出す（2026-11-10 本人指示
 * 「課金版で編集を保存して残せるようにしたい アカウントにひもづいて編集を保存してよびだせるようにしたい」）。
 *
 * 中身はビューアーの Zip 保存と同じ形式の ZIP（project.json ＋ 置いたモデル）。3DGS 本体は入れない
 * （開くときは表示中のシーンをそのまま使う）。保存先は R2 の
 *   viewer-edits/<userId>/<sceneHash>/<editId>.zip   （customMetadata に name / savedAt）
 * 手元の `npm run dev` では R2 が使えないので .viewer-edits-local/ に同じ形で置く。
 * D1 の表は作らない（一覧は利用者×シーンの前置きで R2 を引けば足りる）。
 */

export const VIEWER_EDIT_MAX_BYTES = 30 * 1024 * 1024;
export const VIEWER_EDIT_MAX_PER_SCENE = 20;
const ROOT = "viewer-edits";
const LOCAL_ROOT = path.join(process.cwd(), ".viewer-edits-local");

export type ViewerEditMeta = { id: string; name: string; savedAt: string; size: number };

/** 道具を出してよい人と同じ（/api/viewer-entitlement の full と揃える）。 */
export function canSaveViewerEdits(u: PublicUser | null): boolean {
  if (!u || u.status !== "active") return false;
  return u.role === "admin" || isStudioPurchaseRestricted(u.role) || (u.plan ?? "free") !== "free";
}

/** ビューアーが開いているデータの URL（署名付き R2 URL か /api/r2・/api/viewer-stream のパス）→ R2 キー。 */
export function viewerSrcToKey(src: string): string | null {
  let key = toR2Key(src);
  if (!key) return null;
  key = key.replace(/^api\/viewer-stream\//, "");
  const bucket = process.env.R2_BUCKET || "locahun3d-assets";
  if (key.startsWith(bucket + "/")) key = key.slice(bucket.length + 1);
  try {
    key = decodeURIComponent(key);
  } catch {
    /* そのまま使う */
  }
  return key || null;
}

const safeSeg = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
export const sceneHash = (assetKey: string) => createHash("sha256").update(assetKey).digest("hex").slice(0, 24);
const isEditId = (id: string) => /^[A-Za-z0-9_-]{6,40}$/.test(id);
const prefixOf = (userId: string, assetKey: string) => `${ROOT}/${safeSeg(userId)}/${sceneHash(assetKey)}/`;
const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) || "編集";

export async function listViewerEdits(userId: string, assetKey: string): Promise<ViewerEditMeta[]> {
  const prefix = prefixOf(userId, assetKey);
  const out: ViewerEditMeta[] = [];
  if (canAccessLocalFs()) {
    const dir = path.join(LOCAL_ROOT, prefix);
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      try {
        out.push(JSON.parse(await fs.readFile(path.join(dir, n), "utf8")) as ViewerEditMeta);
      } catch {
        /* 壊れたメタは飛ばす */
      }
    }
  } else {
    const bucket = await getR2Bucket();
    if (!bucket) throw new Error("storage_unavailable");
    let cursor: string | undefined;
    do {
      const listing = await bucket.list({ prefix, cursor, include: ["customMetadata"] });
      for (const o of listing.objects as { key: string; size: number; customMetadata?: Record<string, string> }[]) {
        const id = o.key.slice(prefix.length).replace(/\.zip$/, "");
        if (!isEditId(id)) continue;
        out.push({ id, name: o.customMetadata?.name || "編集", savedAt: o.customMetadata?.savedAt || "", size: o.size });
      }
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
  }
  return out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export async function saveViewerEdit(userId: string, assetKey: string, name: string, bytes: Uint8Array): Promise<ViewerEditMeta> {
  const prefix = prefixOf(userId, assetKey);
  const meta: ViewerEditMeta = { id: nanoid(16), name: cleanName(name), savedAt: new Date().toISOString(), size: bytes.byteLength };
  if (canAccessLocalFs()) {
    const dir = path.join(LOCAL_ROOT, prefix);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${meta.id}.zip`), bytes);
    await fs.writeFile(path.join(dir, `${meta.id}.json`), JSON.stringify(meta));
  } else {
    const bucket = await getR2Bucket();
    if (!bucket) throw new Error("storage_unavailable");
    await bucket.put(`${prefix}${meta.id}.zip`, bytes, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: { name: meta.name, savedAt: meta.savedAt },
    });
  }
  return meta;
}

export async function readViewerEdit(userId: string, assetKey: string, id: string): Promise<Uint8Array | null> {
  if (!isEditId(id)) return null;
  const key = `${prefixOf(userId, assetKey)}${id}.zip`;
  if (canAccessLocalFs()) {
    return fs.readFile(path.join(LOCAL_ROOT, key)).then((b) => new Uint8Array(b)).catch(() => null);
  }
  const bucket = await getR2Bucket();
  if (!bucket) throw new Error("storage_unavailable");
  const got = await bucket.get(key);
  return got ? new Uint8Array(await got.arrayBuffer()) : null;
}

/** 利用者が自分の保存を消す（ビューアーの「削除」ボタン）。 */
export async function deleteViewerEdit(userId: string, assetKey: string, id: string): Promise<void> {
  if (!isEditId(id)) return;
  const base = `${prefixOf(userId, assetKey)}${id}`;
  if (canAccessLocalFs()) {
    await fs.rm(path.join(LOCAL_ROOT, `${base}.zip`), { force: true });
    await fs.rm(path.join(LOCAL_ROOT, `${base}.json`), { force: true });
    return;
  }
  const bucket = await getR2Bucket();
  if (!bucket) throw new Error("storage_unavailable");
  await bucket.delete(`${base}.zip`);
}
