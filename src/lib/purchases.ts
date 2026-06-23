import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const purchaseStatusSchema = z.enum([
  "pending",
  "completed",
  "cancelled",
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
});

export type Purchase = z.infer<typeof purchaseSchema>;
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;

const DATA_FILE = path.join(process.cwd(), "data", "purchases.json");

interface StoreShape {
  version: 1;
  purchases: Purchase[];
}

async function read(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return { version: 1, purchases: [] };
  }
}

async function write(s: StoreShape): Promise<void> {
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(s, null, 2), "utf8");
  } catch {
    // Workers: filesystem writes unavailable
  }
}

export const purchaseRepo = {
  async list(opts?: { userId?: string; propertyId?: string; status?: PurchaseStatus }): Promise<Purchase[]> {
    const s = await read();
    let out = s.purchases;
    if (opts?.userId) out = out.filter((p) => p.userId === opts.userId);
    if (opts?.propertyId) out = out.filter((p) => p.propertyId === opts.propertyId);
    if (opts?.status) out = out.filter((p) => p.status === opts.status);
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<Purchase | null> {
    const s = await read();
    return s.purchases.find((p) => p.id === id) ?? null;
  },

  async getByStripeSession(sessionId: string): Promise<Purchase | null> {
    const s = await read();
    return s.purchases.find((p) => p.stripeSessionId === sessionId) ?? null;
  },

  async hasPurchased(userId: string, propertyId: string, splatItemIndex?: number): Promise<boolean> {
    const s = await read();
    return s.purchases.some(
      (p) => p.userId === userId && p.propertyId === propertyId &&
             (splatItemIndex == null || p.splatItemIndex === splatItemIndex) &&
             p.status === "completed",
    );
  },

  async upsert(p: Purchase): Promise<Purchase> {
    const validated = purchaseSchema.parse(p);
    const s = await read();
    const idx = s.purchases.findIndex((x) => x.id === validated.id);
    if (idx >= 0) s.purchases[idx] = validated;
    else s.purchases.push(validated);
    await write(s);
    return validated;
  },
};
