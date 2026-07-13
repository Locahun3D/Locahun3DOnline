import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete } from "./d1";

/**
 * 物件の「限定プレビュー共有URL」(token -> propertyId)。先方スタジオに公開前の
 * 物件(draft/archived/confidential 含む)をログイン不要で確認してもらうための、
 * 期限付き(既定30日)・失効可能なリンク。bookmark-shares と同型のトークン表。
 *
 * 1物件1トークン: create() は既存を消してから発行する(再発行=URL更新)。失効は
 * 行削除。期限切れ判定は expiresAt を呼び出し側(ルート/ページ)でチェックする
 * (get() は期限に関わらずレコードを返す — 「期限切れ」画面と「存在しない」を
 * 区別して出し分けたいため)。
 */
export interface PropertyPreview {
  token: string;
  propertyId: string;
  createdAt: string;
  expiresAt: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "property-previews.json");
const TABLE = "property_previews";
const DEFAULT_TTL_DAYS = 30;

interface StoreShape {
  version: 1;
  previews: PropertyPreview[];
}

async function fileReadAll(): Promise<PropertyPreview[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.previews ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(previews: PropertyPreview[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, previews }, null, 2));
}

function previewCols(p: PropertyPreview): Record<string, string | number | null> {
  return {
    token: p.token,
    property_id: p.propertyId,
    created_at: p.createdAt,
    expires_at: p.expiresAt,
  };
}

export function isPreviewExpired(
  p: PropertyPreview,
  nowIso: string = new Date().toISOString(),
): boolean {
  return p.expiresAt <= nowIso;
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export const propertyPreviewRepo = {
  async get(token: string): Promise<PropertyPreview | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((p) => p.token === token) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    return d1GetData<PropertyPreview>(db, TABLE, "token", token);
  },

  async findByProperty(propertyId: string): Promise<PropertyPreview | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((p) => p.propertyId === propertyId) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    const rows = await d1ListData<PropertyPreview>(db, TABLE, {
      sql: "property_id = ?",
      binds: [propertyId],
    });
    return rows[0] ?? null;
  },

  async create(opts: { propertyId: string; ttlDays?: number }): Promise<PropertyPreview> {
    // 1物件1トークン: 既存を消してから発行（再発行 = URL 更新）。
    await this.removeByProperty(opts.propertyId);
    const now = new Date().toISOString();
    const preview: PropertyPreview = {
      token: nanoid(18),
      propertyId: opts.propertyId,
      createdAt: now,
      expiresAt: daysFromNow(opts.ttlDays ?? DEFAULT_TTL_DAYS),
    };
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      all.push(preview);
      await fileWriteAll(all);
      return preview;
    }
    const db = await getD1();
    if (!db) throw new Error("プレビューリンクの保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "token", previewCols(preview), preview);
    return preview;
  },

  async removeByProperty(propertyId: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((p) => p.propertyId !== propertyId));
      return;
    }
    const db = await getD1();
    if (!db) return;
    const rows = await d1ListData<PropertyPreview>(db, TABLE, {
      sql: "property_id = ?",
      binds: [propertyId],
    });
    for (const r of rows) await d1Delete(db, TABLE, "token", r.token);
  },
};
