import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete } from "./d1";

/**
 * 物件の「サイト埋め込み用トークン」(token -> propertyId)。
 * 掲載者が自社サイトへ 3D ツアーを iframe で貼るための公開URL
 * （DECISION_LOG D-008 のホスティング商品）。
 *
 * property-previews との違い（同型だが用途が逆なので別テーブルにする）:
 *   preview … 公開前の社内確認用。期限あり(30日)・noindex・確認導線のみ。
 *   embed   … 掲載者サイトでの常設公開用。**期限なし**・第三者サイトから
 *             iframe される前提・訪問者はログインもトークン消費も不要。
 * 期限付きの preview を流用すると、貼った先で30日後に無言で壊れる。
 *
 * 訪問者に課金しないのは意図的な設計。この商品で課金する相手は「掲載者」で
 * あり、埋め込みの閲覧者ではない（掲載者にとっての集客ツールとして売る）。
 *
 * 1物件1トークン: create() は既存を消してから発行する（再発行 = URL 更新。
 * 貼り替えを促す必要があるため、失効と再発行は明確に別操作にしてある）。
 */
export interface PropertyEmbed {
  token: string;
  propertyId: string;
  createdAt: string;
  /** 掲載者が一時的に無効化できる。行削除(失効)とは区別する。 */
  enabled: boolean;
}

const DATA_FILE = path.join(process.cwd(), "data", "property-embeds.json");
const TABLE = "property_embeds";

interface StoreShape {
  version: 1;
  embeds: PropertyEmbed[];
}

async function fileReadAll(): Promise<PropertyEmbed[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.embeds ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(embeds: PropertyEmbed[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, embeds }, null, 2));
}

function embedCols(e: PropertyEmbed): Record<string, string | number | null> {
  return {
    token: e.token,
    property_id: e.propertyId,
    created_at: e.createdAt,
    enabled: e.enabled ? 1 : 0,
  };
}

export const propertyEmbedRepo = {
  async get(token: string): Promise<PropertyEmbed | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((e) => e.token === token) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    return d1GetData<PropertyEmbed>(db, TABLE, "token", token);
  },

  async findByProperty(propertyId: string): Promise<PropertyEmbed | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((e) => e.propertyId === propertyId) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    const rows = await d1ListData<PropertyEmbed>(db, TABLE, {
      sql: "property_id = ?",
      binds: [propertyId],
    });
    return rows[0] ?? null;
  },

  async create(propertyId: string): Promise<PropertyEmbed> {
    await this.removeByProperty(propertyId);
    const embed: PropertyEmbed = {
      token: nanoid(18),
      propertyId,
      createdAt: new Date().toISOString(),
      enabled: true,
    };
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      all.push(embed);
      await fileWriteAll(all);
      return embed;
    }
    const db = await getD1();
    if (!db) throw new Error("埋め込みリンクの保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "token", embedCols(embed), embed);
    return embed;
  },

  async setEnabled(token: string, enabled: boolean): Promise<PropertyEmbed | null> {
    const cur = await this.get(token);
    if (!cur) return null;
    const next = { ...cur, enabled };
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.map((e) => (e.token === token ? next : e)));
      return next;
    }
    const db = await getD1();
    if (!db) return null;
    await d1Upsert(db, TABLE, "token", embedCols(next), next);
    return next;
  },

  async removeByProperty(propertyId: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((e) => e.propertyId !== propertyId));
      return;
    }
    const db = await getD1();
    if (!db) return;
    const rows = await d1ListData<PropertyEmbed>(db, TABLE, {
      sql: "property_id = ?",
      binds: [propertyId],
    });
    for (const r of rows) await d1Delete(db, TABLE, "token", r.token);
  },
};
