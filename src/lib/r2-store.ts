/**
 * R2-backed JSON storage helpers for Cloudflare Workers.
 *
 * Production Workers has NO writable local filesystem (node:fs writes hang /
 * are no-ops via safeWriteFile). The only persistent writable store bound to
 * the Worker is R2 (env.R2_ASSETS). These helpers persist app state there.
 *
 * Two shapes:
 *  - Collection: one R2 object per record under a prefix (race-free upserts).
 *  - Document:   a single R2 object holding one JSON blob.
 *
 * Repos use these on Workers and keep their local-file path for `npm run dev`
 * (branch on canAccessLocalFs()).
 */
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

export async function getR2Bucket(): Promise<AnyBucket | null> {
  try {
    const { env } = await getCloudflareContext();
    return (env as Record<string, unknown>).R2_ASSETS ?? null;
  } catch {
    return null;
  }
}

/* ── Collection (one object per record) ───────────────────────────── */

export async function r2ColPut<T>(prefix: string, id: string, obj: T): Promise<void> {
  const bucket = await getR2Bucket();
  if (!bucket) throw new Error("R2 バケットが利用できません");
  await bucket.put(`${prefix}${id}.json`, JSON.stringify(obj), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function r2ColGet<T>(prefix: string, id: string): Promise<T | null> {
  const bucket = await getR2Bucket();
  if (!bucket) return null;
  const got = await bucket.get(`${prefix}${id}.json`);
  if (!got) return null;
  try {
    return JSON.parse(await got.text()) as T;
  } catch {
    return null;
  }
}

export async function r2ColDelete(prefix: string, id: string): Promise<void> {
  const bucket = await getR2Bucket();
  if (!bucket) return;
  await bucket.delete(`${prefix}${id}.json`);
}

export async function r2ColList<T>(prefix: string): Promise<T[]> {
  const bucket = await getR2Bucket();
  if (!bucket) return [];
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix, cursor });
    for (const obj of listing.objects) {
      const got = await bucket.get(obj.key);
      if (!got) continue;
      try {
        out.push(JSON.parse(await got.text()) as T);
      } catch {
        /* skip corrupt */
      }
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  return out;
}

/* ── Document (single object) ─────────────────────────────────────── */

export async function r2DocGet<T>(key: string): Promise<T | null> {
  const bucket = await getR2Bucket();
  if (!bucket) return null;
  const got = await bucket.get(key);
  if (!got) return null;
  try {
    return JSON.parse(await got.text()) as T;
  } catch {
    return null;
  }
}

export async function r2DocPut<T>(key: string, obj: T): Promise<void> {
  const bucket = await getR2Bucket();
  if (!bucket) throw new Error("R2 バケットが利用できません");
  await bucket.put(key, JSON.stringify(obj), {
    httpMetadata: { contentType: "application/json" },
  });
}
