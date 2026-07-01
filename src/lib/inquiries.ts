import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { r2ColList } from "./r2-store";
import {
  getD1,
  d1GetData,
  d1ListData,
  d1Upsert,
  d1Delete,
  d1IsEmpty,
  type D1,
} from "./d1";
import { z } from "zod";

/**
 * スタジオへの問い合わせ。フォーム送信を必ずここに保存し（lead を失わないため）、
 * 併せて先方メール（property.contactEmail）へ転送する。メール未設定でも記録は残る。
 */
export const inquiryStatusSchema = z.enum(["new", "read", "archived"]);

export const inquirySchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  propertyTitle: z.string().default(""),
  name: z.string().max(80).default(""),
  company: z.string().max(120).default(""),
  email: z.string().max(120).default(""),
  phone: z.string().max(40).default(""),
  purpose: z.string().max(60).default(""),
  preferredDate: z.string().max(20).default(""),
  message: z.string().max(4000).default(""),
  /** 転送先（送信時点の先方メール）。空＝先方メール未設定（運営のみ受領）。 */
  forwardedTo: z.string().max(120).default(""),
  /** メール転送に成功したか（Resend キー未設定なら false でも記録は残る）。 */
  emailed: z.boolean().default(false),
  status: inquiryStatusSchema.default("new"),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type Inquiry = z.infer<typeof inquirySchema>;
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;

const DATA_FILE = path.join(process.cwd(), "data", "inquiries.json");

interface StoreShape {
  version: 1;
  inquiries: Inquiry[];
}

const TABLE = "inquiries";
const R2_PREFIX = "inquiries/"; // 旧本番ストア（D1 への初回シード元）

/* --- local file backend (dev) --- */
async function fileReadAll(): Promise<Inquiry[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.inquiries ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(inquiries: Inquiry[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, inquiries }, null, 2));
}

function inquiryCols(i: Inquiry): Record<string, string | number | null> {
  return {
    id: i.id,
    property_id: i.propertyId ?? null,
    status: i.status ?? null,
    created_at: i.createdAt ?? null,
  };
}

let _seeded = false;
async function ensureSeeded(db: D1): Promise<void> {
  if (_seeded) return;
  if (!(await d1IsEmpty(db, TABLE))) {
    _seeded = true;
    return;
  }
  const r2 = await r2ColList<Inquiry>(R2_PREFIX).catch(() => [] as Inquiry[]);
  for (const i of r2) {
    const v = inquirySchema.safeParse(i);
    if (v.success) await d1Upsert(db, TABLE, "id", inquiryCols(v.data), v.data);
  }
  _seeded = true;
}

export const inquiryRepo = {
  async list(opts?: { propertyId?: string; status?: InquiryStatus }): Promise<Inquiry[]> {
    let out: Inquiry[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
    } else {
      const db = await getD1();
      if (!db) return [];
      await ensureSeeded(db);
      out = await d1ListData<Inquiry>(db, TABLE);
    }
    if (opts?.propertyId) out = out.filter((i) => i.propertyId === opts.propertyId);
    if (opts?.status) out = out.filter((i) => i.status === opts.status);
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<Inquiry | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((i) => i.id === id) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    await ensureSeeded(db);
    return d1GetData<Inquiry>(db, TABLE, "id", id);
  },

  async upsert(i: Inquiry): Promise<Inquiry> {
    const validated = inquirySchema.parse(i);
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("問い合わせの保存先 (D1) が利用できません");
    await ensureSeeded(db);
    await d1Upsert(db, TABLE, "id", inquiryCols(validated), validated);
    return validated;
  },

  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((i) => i.id !== id));
      return;
    }
    const db = await getD1();
    if (db) await d1Delete(db, TABLE, "id", id);
  },
};
