import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete } from "./d1";

/**
 * ブックマーク・フォルダの共有URL(token -> userId/folderId)。フォルダ本体
 * (users.data 内の bookmarkFolders)とは別テーブルで持つ — 共有の発行/失効を
 * フォルダCRUDと独立させるため。Studio/Team プラン限定（呼び出し側で判定）。
 */
export interface BookmarkShare {
  token: string;
  userId: string;
  folderId: string;
  createdAt: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "bookmark-shares.json");
const TABLE = "bookmark_shares";

interface StoreShape {
  version: 1;
  shares: BookmarkShare[];
}

async function fileReadAll(): Promise<BookmarkShare[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.shares ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(shares: BookmarkShare[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, shares }, null, 2));
}

function shareCols(s: BookmarkShare): Record<string, string | number | null> {
  return {
    token: s.token,
    user_id: s.userId,
    folder_id: s.folderId,
    created_at: s.createdAt,
  };
}

export const bookmarkShareRepo = {
  async get(token: string): Promise<BookmarkShare | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((s) => s.token === token) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    return d1GetData<BookmarkShare>(db, TABLE, "token", token);
  },

  async findByUserAndFolder(userId: string, folderId: string): Promise<BookmarkShare | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((s) => s.userId === userId && s.folderId === folderId) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    const rows = await d1ListData<BookmarkShare>(db, TABLE, {
      sql: "user_id = ?",
      binds: [userId],
    });
    return rows.find((s) => s.folderId === folderId) ?? null;
  },

  async create(opts: { userId: string; folderId: string }): Promise<BookmarkShare> {
    const share: BookmarkShare = {
      token: nanoid(14),
      userId: opts.userId,
      folderId: opts.folderId,
      createdAt: new Date().toISOString(),
    };
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      all.push(share);
      await fileWriteAll(all);
      return share;
    }
    const db = await getD1();
    if (!db) throw new Error("共有リンクの保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "token", shareCols(share), share);
    return share;
  },

  async removeByFolder(userId: string, folderId: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((s) => !(s.userId === userId && s.folderId === folderId)));
      return;
    }
    const db = await getD1();
    if (!db) return;
    const rows = await d1ListData<BookmarkShare>(db, TABLE, {
      sql: "user_id = ?",
      binds: [userId],
    });
    const existing = rows.find((s) => s.folderId === folderId);
    if (existing) await d1Delete(db, TABLE, "token", existing.token);
  },
};
