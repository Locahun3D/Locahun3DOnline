import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { canAccessLocalFs } from "./fs-safe";

/**
 * スタジオから届いた写真の実体の置き場（2026-09-26）。
 *
 * 本番は R2 の `quarantine/` 配下。公開配信ルート `/api/r2/...` は GET に認証が無いので、
 * あちらでこの接頭辞を拒否している（app/api/r2/[...path]/route.ts）。ここから読めるのは
 * 管理画面用の認証付きルートだけ。
 * 手元（npm run dev）は R2 バインディングが無いので、data/studio-photo-files/ に置く。
 */

const LOCAL_ROOT = path.join(process.cwd(), "data", "studio-photo-files");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bucket = any;

async function bucket(): Promise<Bucket | null> {
  try {
    const { env } = await getCloudflareContext();
    return (env as Record<string, unknown>).R2_ASSETS ?? null;
  } catch {
    return null;
  }
}

function localPath(key: string): string {
  // キーは quarantineKey() が作った安全な文字だけ。念のためここでも上へ抜けさせない。
  const clean = key.replace(/\\/g, "/").split("/").filter((s) => s && s !== "." && s !== "..");
  return path.join(LOCAL_ROOT, ...clean);
}

export async function putStudioPhoto(
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const b = await bucket();
  if (b) {
    await b.put(key, body, { httpMetadata: { contentType } });
    return;
  }
  if (!canAccessLocalFs()) throw new Error("写真の保存先が利用できません");
  const file = localPath(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(body));
}

export async function getStudioPhoto(key: string): Promise<ArrayBuffer | null> {
  const b = await bucket();
  if (b) {
    const obj = await b.get(key);
    return obj ? await obj.arrayBuffer() : null;
  }
  try {
    const buf = await fs.readFile(localPath(key));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

export async function deleteStudioPhoto(key: string): Promise<void> {
  const b = await bucket();
  if (b) {
    await b.delete(key);
    return;
  }
  try {
    await fs.unlink(localPath(key));
  } catch {
    /* すでに無い */
  }
}

/**
 * 採用時に、隔離した写真を公開用のキーへ複製する。
 * ⚠ ここではバイト列をそのまま移す。EXIF（撮影者・GPS）を落とす再エンコードは
 *   Workers 上で画像を復号できないため、Dropbox 側のパイプライン
 *   （`python scripts/l3d.py photos` と同じ Pillow 経由）で行う。
 *   採用済みで再エンコード前のものは、管理画面の一覧に印を出している。
 */
export async function copyToPublic(fromKey: string, toKey: string, contentType: string): Promise<void> {
  const body = await getStudioPhoto(fromKey);
  if (!body) throw new Error("元の写真が見つかりません");
  const b = await bucket();
  if (b) {
    await b.put(toKey, body, { httpMetadata: { contentType } });
    return;
  }
  if (!canAccessLocalFs()) throw new Error("公開用の保存先が利用できません");
  const file = path.join(process.cwd(), "public", ...toKey.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(body));
}
