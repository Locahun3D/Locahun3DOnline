import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { z } from "zod";

export const purchaseStatusSchema = z.enum([
  "pending",
  "completed",
  "cancelled",
  "refunded",
]);

export const purchaseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  propertyId: z.string(),
  propertyTitle: z.string().default(""),
  splatItemIndex: z.number().int().min(0).default(0),
  itemLabel: z.string().max(60).default(""),
  priceYen: z.number().int().min(0),
  status: purchaseStatusSchema.default("pending"),
  stripeSessionId: z.string().default(""),
  createdAt: z.string().default(() => new Date().toISOString()),
  completedAt: z.string().optional(),
  refundedAt: z.string().optional(),
  refundReason: z.string().max(500).default(""),
});

export type Purchase = z.infer<typeof purchaseSchema>;
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;

const DATA_FILE = path.join(process.cwd(), "data", "purchases.json");

interface StoreShape {
  version: 1;
  purchases: Purchase[];
}

/* ------------------------------------------------------------------ *
 * Storage backends
 *  - dev (local fs): single JSON file at data/purchases.json
 *  - Cloudflare Workers: one R2 object per purchase under purchases/
 *    (per-object avoids read-modify-write clobbering on concurrent buys)
 * ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;
const R2_PREFIX = "purchases/";

async function getBucket(): Promise<AnyBucket | null> {
  try {
    const { env } = await getCloudflareContext();
    return (env as Record<string, unknown>).R2_ASSETS ?? null;
  } catch {
    return null;
  }
}

/* --- local file backend --- */
async function fileReadAll(): Promise<Purchase[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.purchases ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(purchases: Purchase[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, purchases }, null, 2));
}

/* --- R2 backend --- */
async function r2ReadAll(bucket: AnyBucket): Promise<Purchase[]> {
  const out: Purchase[] = [];
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix: R2_PREFIX, cursor });
    for (const obj of listing.objects) {
      const got = await bucket.get(obj.key);
      if (!got) continue;
      try {
        out.push(JSON.parse(await got.text()) as Purchase);
      } catch {
        /* skip corrupt object */
      }
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  return out;
}

async function r2Get(bucket: AnyBucket, id: string): Promise<Purchase | null> {
  const got = await bucket.get(`${R2_PREFIX}${id}.json`);
  if (!got) return null;
  try {
    return JSON.parse(await got.text()) as Purchase;
  } catch {
    return null;
  }
}

async function r2Put(bucket: AnyBucket, p: Purchase): Promise<void> {
  await bucket.put(`${R2_PREFIX}${p.id}.json`, JSON.stringify(p), {
    httpMetadata: { contentType: "application/json" },
  });
}

/* --- unified read --- */
async function readAll(): Promise<Purchase[]> {
  if (canAccessLocalFs()) return fileReadAll();
  const bucket = await getBucket();
  if (!bucket) return [];
  return r2ReadAll(bucket);
}

export const purchaseRepo = {
  async list(opts?: { userId?: string; propertyId?: string; status?: PurchaseStatus }): Promise<Purchase[]> {
    let out = await readAll();
    if (opts?.userId) out = out.filter((p) => p.userId === opts.userId);
    if (opts?.propertyId) out = out.filter((p) => p.propertyId === opts.propertyId);
    if (opts?.status) out = out.filter((p) => p.status === opts.status);
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<Purchase | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((p) => p.id === id) ?? null;
    }
    const bucket = await getBucket();
    if (!bucket) return null;
    return r2Get(bucket, id);
  },

  async getByStripeSession(sessionId: string): Promise<Purchase | null> {
    const all = await readAll();
    return all.find((p) => p.stripeSessionId === sessionId) ?? null;
  },

  async hasPurchased(userId: string, propertyId: string, splatItemIndex?: number): Promise<boolean> {
    const all = await readAll();
    return all.some(
      (p) => p.userId === userId && p.propertyId === propertyId &&
             (splatItemIndex == null || p.splatItemIndex === splatItemIndex) &&
             p.status === "completed",
    );
  },

  async upsert(p: Purchase): Promise<Purchase> {
    const validated = purchaseSchema.parse(p);
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const bucket = await getBucket();
    if (!bucket) throw new Error("購入データの保存先 (R2) が利用できません");
    await r2Put(bucket, validated);
    return validated;
  },

  /** 購入記録を完全削除（テスト購入の掃除・管理者専用想定）。 */
  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((p) => p.id !== id));
      return;
    }
    const bucket = await getBucket();
    if (!bucket) return;
    await bucket.delete(`${R2_PREFIX}${id}.json`);
  },
};
