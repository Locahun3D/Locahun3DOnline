import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete, type D1 } from "./d1";
import { z } from "zod";

/**
 * サイト全体向けの一般お問い合わせ（/contact）。物件に紐付く既存の
 * inquiries（スタジオへの問い合わせ）とは別モデル — propertyId を持たず、
 * 運営（operatorAddress）へ転送する。
 */
export const CONTACT_TYPES = ["bug", "request", "listing", "general", "license"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  bug: "バグ報告",
  request: "ほしい物件追加",
  listing: "掲載依頼",
  general: "ご相談",
  // データの再配布・AI学習利用・API/データ連携などの個別相談窓口。禁止ではなく
  // 「案件による」ため、既存の一般問い合わせ(general)とは分けて受け付ける
  // （2026-07-23新設）。
  license: "データ利用・提携のご相談",
};

export const contactStatusSchema = z.enum(["new", "read", "archived"]);
export type ContactStatus = z.infer<typeof contactStatusSchema>;

export const contactRequestSchema = z.object({
  id: z.string(),
  type: z.enum(CONTACT_TYPES),
  name: z.string().max(80).default(""),
  email: z.string().max(120).default(""),
  company: z.string().max(120).default(""), // listing: 会社名・オーナー名
  phone: z.string().max(40).default(""), // listing: 電話番号（任意）
  url: z.string().max(300).default(""), // bug: 発生ページURL
  environment: z.string().max(200).default(""), // bug: ご利用環境（自動入力・任意）
  area: z.string().max(120).default(""), // request: 希望エリア
  propertyName: z.string().max(120).default(""), // listing: 物件名
  address: z.string().max(200).default(""), // listing: 所在地
  message: z.string().max(4000).default(""), // 全type共通の本文
  attachments: z.array(z.string().max(300)).max(3).default([]), // bug: 添付画像URL
  forwardedTo: z.string().max(120).default(""),
  emailed: z.boolean().default(false),
  // 運営からの返信（inquiries と同じ単一返信モデル。再返信は上書き）
  reply: z.string().max(4000).default(""),
  repliedAt: z.string().nullable().default(null),
  replyEmailed: z.boolean().default(false),
  status: contactStatusSchema.default("new"),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type ContactRequest = z.infer<typeof contactRequestSchema>;

const DATA_FILE = path.join(process.cwd(), "data", "contact-requests.json");
const TABLE = "contact_requests";

interface StoreShape {
  version: 1;
  requests: ContactRequest[];
}

/**
 * 読み出し時に必ずスキーマを通して欠損フィールドを既定値で埋める。
 * 保存後にスキーマへ列を足すと、旧レコードには新列が無く
 * `c.attachments.length` 等で一覧ページごと500になる（実害あり）。
 */
function normalize(rows: unknown[]): ContactRequest[] {
  const out: ContactRequest[] = [];
  for (const r of rows) {
    const p = contactRequestSchema.safeParse(r);
    if (p.success) out.push(p.data);
    else console.error("[contact-requests] 不正レコードをスキップ:", p.error.issues[0]);
  }
  return out;
}

async function fileReadAll(): Promise<ContactRequest[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return normalize(s.requests ?? []);
  } catch {
    return [];
  }
}

async function fileWriteAll(requests: ContactRequest[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, requests }, null, 2));
}

function contactCols(c: ContactRequest): Record<string, string | number | null> {
  return {
    id: c.id,
    type: c.type,
    status: c.status,
    created_at: c.createdAt,
  };
}

export const contactRequestRepo = {
  async list(opts?: { type?: ContactType; status?: ContactStatus }): Promise<ContactRequest[]> {
    let out: ContactRequest[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
    } else {
      const db = await getD1();
      if (!db) return [];
      out = normalize(await d1ListData<ContactRequest>(db, TABLE));
    }
    if (opts?.type) out = out.filter((c) => c.type === opts.type);
    if (opts?.status) out = out.filter((c) => c.status === opts.status);
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<ContactRequest | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((c) => c.id === id) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    const row = await d1GetData<ContactRequest>(db, TABLE, "id", id);
    return row ? (normalize([row])[0] ?? null) : null;
  },

  async upsert(c: ContactRequest): Promise<ContactRequest> {
    const validated = contactRequestSchema.parse(c);
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("お問い合わせの保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "id", contactCols(validated), validated);
    return validated;
  },

  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((c) => c.id !== id));
      return;
    }
    const db = await getD1();
    if (db) await d1Delete(db, TABLE, "id", id);
  },
};
