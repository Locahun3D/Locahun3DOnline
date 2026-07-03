import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete } from "./d1";
import { z } from "zod";

/**
 * 視聴アンロック記録。
 *
 * サブスク会員が 3DGS シーン（splatItem 単位）を初めて開くとき tokenCost トークンを
 * 消費し、その「アンロック」をここに記録する。一度アンロックしたシーンは 2 年間
 * 無償で再視聴できる（`expiresAt` まで）。物件に複数シーンがある場合は
 * (propertyId, splatItemIndex) の組でシーンごとに独立してアンロックする。
 *
 * 保存先は purchases.ts と同じ二層構成:
 *  - dev (local fs): `data/view-unlocks.json`
 *  - deployed (Workers): D1 テーブル `view_unlocks`
 *
 * id は `${userId}:${propertyId}:${splatItemIndex}` の自然キー。同一シーンの再
 * アンロックは同じ id になるため upsert が冪等（リトライで二重生成しない）。
 */
export const viewUnlockSchema = z.object({
  id: z.string(),
  userId: z.string(),
  propertyId: z.string(),
  splatItemIndex: z.number().int().min(0).default(0),
  /** アンロック時点の tokenCost のスナップショット（監査用）。 */
  tokensSpent: z.number().int().min(0).default(0),
  unlockedAt: z.string().default(() => new Date().toISOString()),
  /** unlockedAt + 2年 (ISO)。この時刻を過ぎると無償再視聴の対象外になる。 */
  expiresAt: z.string(),
});

export type ViewUnlock = z.infer<typeof viewUnlockSchema>;

const DATA_FILE = path.join(process.cwd(), "data", "view-unlocks.json");
const TABLE = "view_unlocks";

interface StoreShape {
  version: 1;
  unlocks: ViewUnlock[];
}

/** 自然キー（冪等 upsert 用）。 */
export function unlockId(userId: string, propertyId: string, splatItemIndex: number): string {
  return `${userId}:${propertyId}:${splatItemIndex}`;
}

/** unlockedAt から 2 年後の ISO。 */
export function twoYearsFrom(nowIso: string): string {
  const d = new Date(nowIso);
  d.setFullYear(d.getFullYear() + 2);
  return d.toISOString();
}

/* --- local file backend (dev) --- */
async function fileReadAll(): Promise<ViewUnlock[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.unlocks ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(unlocks: ViewUnlock[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, unlocks }, null, 2));
}

/** D1 の実カラム抽出（id 含む）。 */
function unlockCols(u: ViewUnlock): Record<string, string | number | null> {
  return {
    id: u.id,
    user_id: u.userId,
    property_id: u.propertyId,
    splat_item_index: u.splatItemIndex ?? 0,
    expires_at: u.expiresAt,
    created_at: u.unlockedAt,
  };
}

export const viewUnlockRepo = {
  async list(opts?: { userId?: string; propertyId?: string }): Promise<ViewUnlock[]> {
    let out: ViewUnlock[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
      if (opts?.userId) out = out.filter((u) => u.userId === opts.userId);
      if (opts?.propertyId) out = out.filter((u) => u.propertyId === opts.propertyId);
    } else {
      const db = await getD1();
      if (!db) return [];
      const conds: string[] = [];
      const binds: (string | number)[] = [];
      if (opts?.userId) { conds.push("user_id = ?"); binds.push(opts.userId); }
      if (opts?.propertyId) { conds.push("property_id = ?"); binds.push(opts.propertyId); }
      out = await d1ListData<ViewUnlock>(
        db,
        TABLE,
        conds.length ? { sql: conds.join(" AND "), binds } : undefined,
      );
    }
    return out.sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
  },

  async get(id: string): Promise<ViewUnlock | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((u) => u.id === id) ?? null;
    }
    const db = await getD1();
    return db ? d1GetData<ViewUnlock>(db, TABLE, "id", id) : null;
  },

  /**
   * このユーザーが該当シーンを「まだ有効な（未失効の）」アンロック済みか。
   * expiresAt が現在より未来なら true。
   */
  async hasValidUnlock(
    userId: string,
    propertyId: string,
    splatItemIndex: number,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const id = unlockId(userId, propertyId, splatItemIndex);
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const rec = all.find((u) => u.id === id);
      return !!rec && rec.expiresAt > now;
    }
    const db = await getD1();
    if (!db) return false;
    const row = await db
      .prepare(`SELECT 1 FROM ${TABLE} WHERE id = ? AND expires_at > ? LIMIT 1`)
      .bind(id, now)
      .first();
    return !!row;
  },

  async upsert(u: ViewUnlock): Promise<ViewUnlock> {
    const validated = viewUnlockSchema.parse(u);
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("アンロックデータの保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "id", unlockCols(validated), validated);
    return validated;
  },

  /** アンロック記録を完全削除（テスト掃除・管理者専用想定）。 */
  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((u) => u.id !== id));
      return;
    }
    const db = await getD1();
    if (db) await d1Delete(db, TABLE, "id", id);
  },
};
