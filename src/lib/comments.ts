import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import {
  getD1,
  d1ListData,
  d1Upsert,
  d1Delete,
  d1IsEmpty,
  type D1,
} from "./d1";
import { z } from "zod";

/**
 * 物件ごとの掲示板コメント。会員限定（サインイン済みユーザーのみ閲覧・投稿）。
 * 他リポジトリと同じハイブリッド行（実カラム + data JSON）で dev(JSON file) /
 * deployed(D1) を切り替える。
 */
export const commentSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  userId: z.string(),
  /** 投稿時点の表示名（後でユーザーが改名しても過去コメントの表記は変わらない）。 */
  userName: z.string().max(80).default("匿名ユーザー"),
  body: z.string().min(1).max(1000),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type Comment = z.infer<typeof commentSchema>;

const DATA_FILE = path.join(process.cwd(), "data", "comments.json");
const TABLE = "comments";

interface StoreShape {
  version: 1;
  comments: Comment[];
}

async function fileReadAll(): Promise<Comment[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.comments ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(comments: Comment[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, comments }, null, 2));
}

function commentCols(c: Comment): Record<string, string | number | null> {
  return {
    id: c.id,
    property_id: c.propertyId ?? null,
    user_id: c.userId ?? null,
    created_at: c.createdAt ?? null,
  };
}

let _seeded = false;
async function ensureSeeded(db: D1): Promise<void> {
  if (_seeded) return;
  if (!(await d1IsEmpty(db, TABLE))) {
    _seeded = true;
    return;
  }
  _seeded = true;
}

export const commentRepo = {
  async list(propertyId: string): Promise<Comment[]> {
    let out: Comment[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
    } else {
      const db = await getD1();
      if (!db) return [];
      await ensureSeeded(db);
      out = await d1ListData<Comment>(db, TABLE);
    }
    return out
      .filter((c) => c.propertyId === propertyId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async get(id: string): Promise<Comment | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((c) => c.id === id) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    await ensureSeeded(db);
    const all = await d1ListData<Comment>(db, TABLE);
    return all.find((c) => c.id === id) ?? null;
  },

  async upsert(c: Comment): Promise<Comment> {
    const validated = commentSchema.parse(c);
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("コメントの保存先 (D1) が利用できません");
    await ensureSeeded(db);
    await d1Upsert(db, TABLE, "id", commentCols(validated), validated);
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
