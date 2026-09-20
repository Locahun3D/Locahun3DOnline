import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert } from "./d1";

/**
 * 3DGSビューアーの「共有URL」(token -> シーン)。2026-09-20 本人指示: 最上位プラン（Team）の機能。
 * 発行者が視聴できるシーンを、ログイン不要・期限付き（既定7日）で第三者に見せる。
 * property-previews と同型のトークン表だが、1シーン単位で発行者を持つ。
 * 同じ発行者×同じシーンで有効なリンクが残っていれば再利用する（押すたびに増やさない）。
 */
export interface ViewerShare {
  token: string;
  propertyId: string;
  splatItemId: string;
  assetKey: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "viewer-shares.json");
const TABLE = "viewer_shares";
export const VIEWER_SHARE_TTL_DAYS = 7;

async function fileReadAll(): Promise<ViewerShare[]> {
  try {
    const s = JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as { shares?: ViewerShare[] };
    return s.shares ?? [];
  } catch {
    return [];
  }
}

function cols(s: ViewerShare): Record<string, string | number | null> {
  return {
    token: s.token,
    property_id: s.propertyId,
    splat_item_id: s.splatItemId,
    asset_key: s.assetKey,
    created_by: s.createdBy,
    created_at: s.createdAt,
    expires_at: s.expiresAt,
  };
}

export function isViewerShareExpired(s: ViewerShare, nowIso: string = new Date().toISOString()): boolean {
  return s.expiresAt <= nowIso;
}

export const viewerShareRepo = {
  async get(token: string): Promise<ViewerShare | null> {
    if (canAccessLocalFs()) return (await fileReadAll()).find((s) => s.token === token) ?? null;
    const db = await getD1();
    if (!db) return null;
    return d1GetData<ViewerShare>(db, TABLE, "token", token);
  },

  async findActive(createdBy: string, assetKey: string): Promise<ViewerShare | null> {
    const now = new Date().toISOString();
    if (canAccessLocalFs()) {
      return (
        (await fileReadAll()).find((s) => s.createdBy === createdBy && s.assetKey === assetKey && s.expiresAt > now) ?? null
      );
    }
    const db = await getD1();
    if (!db) return null;
    const rows = await d1ListData<ViewerShare>(db, TABLE, {
      sql: "created_by = ? AND asset_key = ? AND expires_at > ?",
      binds: [createdBy, assetKey, now],
    });
    return rows[0] ?? null;
  },

  async create(opts: Omit<ViewerShare, "token" | "createdAt" | "expiresAt">): Promise<ViewerShare> {
    const existing = await this.findActive(opts.createdBy, opts.assetKey);
    if (existing) return existing;
    const share: ViewerShare = {
      ...opts,
      token: nanoid(20),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + VIEWER_SHARE_TTL_DAYS * 86_400_000).toISOString(),
    };
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      all.push(share);
      await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, shares: all }, null, 2));
      return share;
    }
    const db = await getD1();
    if (!db) throw new Error("共有リンクの保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "token", cols(share), share);
    return share;
  },
};
