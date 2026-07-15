import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete } from "./d1";
import { z } from "zod";

export const purchaseStatusSchema = z.enum([
  "pending",
  "completed",
  "cancelled",
  "refunded",
]);

export const purchaseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  propertyId: z.string(),
  propertyTitle: z.string().default(""),
  /** splatItem.id（永続識別子）のスナップショット。並び替え/差し替えに強い解決に使う。 */
  splatItemId: z.string().default(""),
  /** 旧方式の配列位置スナップショット（後方互換フォールバック用）。 */
  splatItemIndex: z.number().int().min(0).default(0),
  itemLabel: z.string().max(60).default(""),
  /**
   * 購入時点のライセンス区分スナップショット（standard/editorial/extended/custom）。
   * 管理画面で後から license を変更しても、既存の購入者の領収書/利用範囲は
   * 購入時点の値のまま固定する（利用許諾は購入時点で確定した契約内容のため）。
   */
  license: z.string().default("standard"),
  /**
   * 3Dデータ利用規約(/terms/data-download)への同意日時。購入APIがサーバー側で
   * 同意フラグを検証した時刻を記録する（クライアントのチェックボックスだけに
   * 頼らない）。無償配布(¥0)でも「誰がいつ同意したか」の証跡として残す。
   * 旧レコードは未記録のため optional。
   */
  termsAgreedAt: z.string().optional(),
  priceYen: z.number().int().min(0),
  status: purchaseStatusSchema.default("pending"),
  stripeSessionId: z.string().default(""),
  createdAt: z.string().default(() => new Date().toISOString()),
  completedAt: z.string().optional(),
  refundedAt: z.string().optional(),
  refundReason: z.string().max(500).default(""),
});

export type Purchase = z.infer<typeof purchaseSchema>;
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;

interface SplatItemLike {
  id: string;
}

/**
 * 購入がどの splatItem を指しているかを解決する。splatItemId（永続識別子）を
 * 優先し、旧購入レコード（splatItemId が空）は記録当時の splatItemIndex に
 * フォールバックする。並び替え/追加削除で index がズレても、新しい購入は
 * 正しいアイテムを指し続ける（ダウンロード誤配布・領収書の内容相違を防ぐ）。
 */
export function resolvePurchasedItem<T extends SplatItemLike>(
  splatItems: T[],
  purchase: Pick<Purchase, "splatItemId" | "splatItemIndex">,
): T | null {
  if (purchase.splatItemId) {
    const byId = splatItems.find((it) => it.id === purchase.splatItemId);
    if (byId) return byId;
  }
  return splatItems[purchase.splatItemIndex] ?? null;
}

const DATA_FILE = path.join(process.cwd(), "data", "purchases.json");

interface StoreShape {
  version: 1;
  purchases: Purchase[];
}

/* ------------------------------------------------------------------ *
 * Storage backends
 *  - dev (local fs): single JSON file at data/purchases.json
 *  - deployed (Workers): D1 テーブル `purchases`（R2 から移行）。
 *    getByStripeSession / hasPurchased が index 参照になり O(n) 全スキャンを解消。
 *    UNIQUE(stripe_session_id) で同一セッションの二重購入行を防止（空=NULLに写して
 *    pending 同士の衝突は回避）。
 * ------------------------------------------------------------------ */

const TABLE = "purchases";

/* --- local file backend (dev) --- */
async function fileReadAll(): Promise<Purchase[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.purchases ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(purchases: Purchase[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, purchases }, null, 2));
}

/** D1 の実カラム抽出（id 含む）。空の session は NULL に写して UNIQUE 衝突を避ける。 */
function purchaseCols(p: Purchase): Record<string, string | number | null> {
  return {
    id: p.id,
    user_id: p.userId,
    property_id: p.propertyId,
    splat_item_index: p.splatItemIndex ?? 0,
    status: p.status,
    stripe_session_id: p.stripeSessionId || null,
    created_at: p.createdAt,
  };
}

export const purchaseRepo = {
  async list(opts?: { userId?: string; propertyId?: string; status?: PurchaseStatus }): Promise<Purchase[]> {
    let out: Purchase[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
      if (opts?.userId) out = out.filter((p) => p.userId === opts.userId);
      if (opts?.propertyId) out = out.filter((p) => p.propertyId === opts.propertyId);
      if (opts?.status) out = out.filter((p) => p.status === opts.status);
    } else {
      const db = await getD1();
      if (!db) return [];
      const conds: string[] = [];
      const binds: (string | number)[] = [];
      if (opts?.userId) { conds.push("user_id = ?"); binds.push(opts.userId); }
      if (opts?.propertyId) { conds.push("property_id = ?"); binds.push(opts.propertyId); }
      if (opts?.status) { conds.push("status = ?"); binds.push(opts.status); }
      out = await d1ListData<Purchase>(
        db,
        TABLE,
        conds.length ? { sql: conds.join(" AND "), binds } : undefined,
      );
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<Purchase | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((p) => p.id === id) ?? null;
    }
    const db = await getD1();
    return db ? d1GetData<Purchase>(db, TABLE, "id", id) : null;
  },

  async getByStripeSession(sessionId: string): Promise<Purchase | null> {
    if (!sessionId) return null;
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((p) => p.stripeSessionId === sessionId) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    const rows = await d1ListData<Purchase>(db, TABLE, {
      sql: "stripe_session_id = ?",
      binds: [sessionId],
    });
    return rows[0] ?? null;
  },

  /**
   * splatItemId（永続識別子）優先で判定し、splatItemId 未指定の呼び出し/旧
   * レコード（splatItemId が空）は splatItemIndex にフォールバックする。1物件
   * あたり最大20アイテムなので、該当ユーザー×物件の完了済み購入をまとめて
   * 取得してからアプリ側で判定する（D1に新カラムを増やさず後方互換を保てる）。
   */
  async hasPurchased(
    userId: string,
    propertyId: string,
    splatItemId?: string,
    legacySplatItemIndex?: number,
  ): Promise<boolean> {
    let rows: Purchase[];
    if (canAccessLocalFs()) {
      rows = (await fileReadAll()).filter(
        (p) => p.userId === userId && p.propertyId === propertyId && p.status === "completed",
      );
    } else {
      const db = await getD1();
      if (!db) return false;
      rows = await d1ListData<Purchase>(db, TABLE, {
        sql: "user_id = ? AND property_id = ? AND status = 'completed'",
        binds: [userId, propertyId],
      });
    }
    if (splatItemId == null && legacySplatItemIndex == null) return rows.length > 0;
    return rows.some((p) => {
      if (splatItemId && p.splatItemId) return p.splatItemId === splatItemId;
      const fallbackIndex = legacySplatItemIndex ?? 0;
      return p.splatItemIndex === fallbackIndex;
    });
  },

  async upsert(p: Purchase): Promise<Purchase> {
    const validated = purchaseSchema.parse(p);
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("購入データの保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "id", purchaseCols(validated), validated);
    return validated;
  },

  /**
   * status='pending' の場合のみ 'completed' へ更新する（条件付き・冪等）。
   * Stripe の success_url 戻り（/api/purchase/return）と webhook
   * （checkout.session.completed）はほぼ同時に届き得る両方が独立に
   * upsert()を呼ぶ従来実装だと、双方が read-then-write の間に競合し、
   * 「completed 化 + notifyPurchase 呼び出し」が2回走る（購入完了メール
   * 二重送信）余地があった。D1 では `UPDATE ... WHERE status='pending'`
   * を1SQLで実行し、実際に更新できた行数(meta.changes)で「自分がこの
   * 購入を完了させた最初の呼び出しか」を判定する。0件なら既に他方が
   * 完了させていたということなので null を返し、呼び出し元は通知等を
   * スキップする。dev(JSONファイル)はシングルプロセスのため素朴な
   * read-then-write のままで実務上問題ない。
   */
  async markCompletedIfPending(
    id: string,
    completedAt: string,
  ): Promise<Purchase | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === id);
      if (idx < 0 || all[idx].status !== "pending") return null;
      const validated = purchaseSchema.parse({
        ...all[idx],
        status: "completed",
        completedAt,
      });
      all[idx] = validated;
      await fileWriteAll(all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("購入データの保存先 (D1) が利用できません");
    const existing = await d1GetData<Purchase>(db, TABLE, "id", id);
    if (!existing || existing.status !== "pending") return null;
    const validated = purchaseSchema.parse({
      ...existing,
      status: "completed",
      completedAt,
    });
    const res = await db
      .prepare(
        `UPDATE ${TABLE} SET status = ?, data = ? WHERE id = ? AND status = 'pending'`,
      )
      .bind("completed", JSON.stringify(validated), id)
      .run();
    const changed = res?.meta?.changes ?? res?.changes ?? 0;
    if (!changed) return null; // 他方の呼び出しが先に完了させていた
    return validated;
  },

  /** 購入記録を完全削除（テスト購入の掃除・管理者専用想定）。 */
  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((p) => p.id !== id));
      return;
    }
    const db = await getD1();
    if (db) await d1Delete(db, TABLE, "id", id);
  },
};
