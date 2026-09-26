import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete } from "./d1";
import type { StudioPhoto, StudioPhotoStatus } from "./studio-photo-intake";

/**
 * スタジオが確認メールから送ってきた写真の台帳（2026-09-26）。
 *
 * 本体（画像）は R2 の quarantine/ 配下、こちらはその索引。物件JSONへ入れない理由は
 * migrations/0020_studio_photos.sql のコメントのとおり（公開ページのクライアントへ
 * 未採用写真の保存キーが渡ってしまうため）。
 * 判断のルールは純関数側 lib/studio-photo-intake.ts。
 */

const DATA_FILE = path.join(process.cwd(), "data", "studio-photos.json");
const TABLE = "studio_photos";

interface StoreShape {
  version: 1;
  photos: StudioPhoto[];
}

async function fileReadAll(): Promise<StudioPhoto[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return (JSON.parse(raw) as StoreShape).photos ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(photos: StudioPhoto[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, photos }, null, 2));
}

function cols(p: StudioPhoto): Record<string, string | number | null> {
  return {
    id: p.id,
    property_id: p.propertyId,
    status: p.status,
    created_at: p.createdAt,
  };
}

export const studioPhotoRepo = {
  async get(id: string): Promise<StudioPhoto | null> {
    if (canAccessLocalFs()) {
      return (await fileReadAll()).find((p) => p.id === id) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    return d1GetData<StudioPhoto>(db, TABLE, "id", id);
  },

  async listByProperty(propertyId: string): Promise<StudioPhoto[]> {
    const sort = (rows: StudioPhoto[]) =>
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (canAccessLocalFs()) {
      return sort((await fileReadAll()).filter((p) => p.propertyId === propertyId));
    }
    const db = await getD1();
    if (!db) return [];
    return sort(
      await d1ListData<StudioPhoto>(db, TABLE, { sql: "property_id = ?", binds: [propertyId] }),
    );
  },

  async countPending(propertyId: string): Promise<number> {
    return (await this.listByProperty(propertyId)).filter((p) => p.status === "pending").length;
  },

  async create(input: Omit<StudioPhoto, "id" | "createdAt" | "status">): Promise<StudioPhoto> {
    const photo: StudioPhoto = {
      ...input,
      id: nanoid(16),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      all.push(photo);
      await fileWriteAll(all);
      return photo;
    }
    const db = await getD1();
    if (!db) throw new Error("写真の保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "id", cols(photo), photo);
    return photo;
  },

  async setStatus(
    id: string,
    status: StudioPhotoStatus,
    extra: { publishedUrl?: string | null } = {},
  ): Promise<StudioPhoto | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: StudioPhoto = {
      ...existing,
      status,
      decidedAt: new Date().toISOString(),
      publishedUrl: extra.publishedUrl ?? existing.publishedUrl ?? null,
    };
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.map((p) => (p.id === id ? next : p)));
      return next;
    }
    const db = await getD1();
    if (!db) return null;
    await d1Upsert(db, TABLE, "id", cols(next), next);
    return next;
  },

  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((p) => p.id !== id));
      return;
    }
    const db = await getD1();
    if (!db) return;
    await d1Delete(db, TABLE, "id", id);
  },
};
