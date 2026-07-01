import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete } from "./d1";
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
 *  - deployed (Workers): D1 テーブル `purchases`（R2 から移行）。
 *    getByStripeSession / hasPurchased が index 参照になり O(n) 全スキャンを解消。
 *    UNIQUE(stripe_session_id) で同一セッションの二重購入行を防止（空=NULLに写して
 *    pending 同士の衝突は回避）。
 * ------------------------------------------------------------------ */

const TABLE = "purchases";

/* --- local file backend (dev) --- */
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

/** D1 の実カラム抽出（id 含む）。空の session は NULL に写して UNIQUE 衝突を避ける。 */
function purchaseCols(p: Purchase): Record<string, string | number | null> {
  return {
    id: p.id,
    user_id: p.userId,
    property_id: p.propertyId,
    splat_item_index: p.splatItemIndex ?? 0,
    status: p.status,
    stripe_session_id: p.stripeSessionId || null,
    created_at: p.createdAt,
  };
}

export const purchaseRepo = {
  async list(opts?: { userId?: string; propertyId?: string; status?: PurchaseStatus }): Promise<Purchase[]> {
    let out: Purchase[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
      if (opts?.userId) out = out.filter((p) => p.userId === opts.userId);
      if (opts?.propertyId) out = out.filter((p) => p.propertyId === opts.propertyId);
      if (opts?.status) out = out.filter((p) => p.status === opts.status);
    } else {
      const db = await getD1();
      if (!db) return [];
      const conds: string[] = [];
      const binds: (string | number)[] = [];
      if (opts?.userId) { conds.push("user_id = ?"); binds.push(opts.userId); }
      if (opts?.propertyId) { conds.push("property_id = ?"); binds.push(opts.propertyId); }
      if (opts?.status) { conds.push("status = ?"); binds.push(opts.status); }
      out = await d1ListData<Purchase>(
        db,
        TABLE,
        conds.length ? { sql: conds.join(" AND "), binds } : undefined,
      );
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<Purchase | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((p) => p.id === id) ?? null;
    }
    const db = await getD1();
    return db ? d1GetData<Purchase>(db, TABLE, "id", id) : null;
  },

  async getByStripeSession(sessionId: string): Promise<Purchase | null> {
    if (!sessionId) return null;
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((p) => p.stripeSessionId === sessionId) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    const rows = await d1ListData<Purchase>(db, TABLE, {
      sql: "stripe_session_id = ?",
      binds: [sessionId],
    });
    return rows[0] ?? null;
  },

  async hasPurchased(userId: string, propertyId: string, splatItemIndex?: number): Promise<boolean> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.some(
        (p) => p.userId === userId && p.propertyId === propertyId &&
               (splatItemIndex == null || p.splatItemIndex === splatItemIndex) &&
               p.status === "completed",
      );
    }
    const db = await getD1();
    if (!db) return false;
    const conds = ["user_id = ?", "property_id = ?", "status = 'completed'"];
    const binds: (string | number)[] = [userId, propertyId];
    if (splatItemIndex != null) { conds.push("splat_item_index = ?"); binds.push(splatItemIndex); }
    const row = await db
      .prepare(`SELECT 1 FROM ${TABLE} WHERE ${conds.join(" AND ")} LIMIT 1`)
      .bind(...binds)
      .first();
    return !!row;
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
    const db = await getD1();
    if (!db) throw new Error("購入データの保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "id", purchaseCols(validated), validated);
    return validated;
  },

  /** 購入記録を完全削除（テスト購入の掃除・管理者専用想定）。 */
  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((p) => p.id !== id));
      return;
    }
    const db = await getD1();
    if (db) await d1Delete(db, TABLE, "id", id);
  },
};
