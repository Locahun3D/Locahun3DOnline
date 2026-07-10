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
 * 物件ごとのレビュー・評価（★1〜5 + 任意本文）。掲示板（comments.ts）とは別の
 * 信頼性の高い評価システム。3DGS を視聴（アンロック）済みのユーザーのみ投稿可能
 * （postOrUpdateReviewAction 側で判定）。1ユーザー1物件につき1件（編集可）。
 * 他リポジトリと同じハイブリッド行（実カラム + data JSON）で dev(JSON file) /
 * deployed(D1) を切り替える。
 */
export const reviewSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  userId: z.string(),
  /** 投稿時点の表示名（後でユーザーが改名しても過去レビューの表記は変わらない）。 */
  userName: z.string().max(80).default("匿名ユーザー"),
  rating: z.number().int().min(1).max(5),
  /** 本文は任意（星のみでも投稿可）。 */
  body: z.string().max(1000).default(""),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
  /** 荒らし通報の履歴（1ユーザー1回、reportReviewAction で追記）。 */
  reports: z
    .array(z.object({ userId: z.string(), at: z.string() }))
    .default([]),
  /** 通報が閾値に達し非admin閲覧から自動的に隠された状態。 */
  hiddenByReports: z.boolean().default(false),
});
export type Review = z.infer<typeof reviewSchema>;

const DATA_FILE = path.join(process.cwd(), "data", "reviews.json");
const TABLE = "reviews";

interface StoreShape {
  version: 1;
  reviews: Review[];
}

async function fileReadAll(): Promise<Review[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.reviews ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(reviews: Review[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, reviews }, null, 2));
}

function reviewCols(r: Review): Record<string, string | number | null> {
  return {
    id: r.id,
    property_id: r.propertyId ?? null,
    user_id: r.userId ?? null,
    created_at: r.createdAt ?? null,
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

export const reviewRepo = {
  async list(propertyId: string): Promise<Review[]> {
    let out: Review[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
    } else {
      const db = await getD1();
      if (!db) return [];
      await ensureSeeded(db);
      out = await d1ListData<Review>(db, TABLE);
    }
    return out
      .filter((r) => r.propertyId === propertyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** 全物件の全レビューを1回で取得（集計ヘルパー用。propertyId 絞り込み無し）。 */
  async listAll(): Promise<Review[]> {
    if (canAccessLocalFs()) {
      return fileReadAll();
    }
    const db = await getD1();
    if (!db) return [];
    await ensureSeeded(db);
    return d1ListData<Review>(db, TABLE);
  },

  async get(id: string): Promise<Review | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((r) => r.id === id) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    await ensureSeeded(db);
    const all = await d1ListData<Review>(db, TABLE);
    return all.find((r) => r.id === id) ?? null;
  },

  /** このユーザーがこの物件に既にレビュー投稿済みか（編集モード判定用）。 */
  async getByUser(propertyId: string, userId: string): Promise<Review | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((r) => r.propertyId === propertyId && r.userId === userId) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    await ensureSeeded(db);
    const all = await d1ListData<Review>(db, TABLE, {
      sql: "property_id = ? AND user_id = ?",
      binds: [propertyId, userId],
    });
    return all[0] ?? null;
  },

  async upsert(r: Review): Promise<Review> {
    const validated = reviewSchema.parse(r);
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("レビューの保存先 (D1) が利用できません");
    await ensureSeeded(db);
    await d1Upsert(db, TABLE, "id", reviewCols(validated), validated);
    return validated;
  },

  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      await fileWriteAll(all.filter((r) => r.id !== id));
      return;
    }
    const db = await getD1();
    if (db) await d1Delete(db, TABLE, "id", id);
  },
};

export interface ReviewStats {
  average: number; // 小数1桁、0件なら0
  count: number; // 非表示を除いた件数
}

/** 非表示(hiddenByReports)を除外した平均ratingと件数。小数1桁に丸める。 */
export function computeReviewStats(reviews: Review[]): ReviewStats {
  const visible = reviews.filter((r) => !r.hiddenByReports);
  if (visible.length === 0) return { average: 0, count: 0 };
  const sum = visible.reduce((acc, r) => acc + r.rating, 0);
  const average = Math.round((sum / visible.length) * 10) / 10;
  return { average, count: visible.length };
}

/** 単一物件の集計（非表示除外）。 */
export async function reviewStats(propertyId: string): Promise<ReviewStats> {
  const reviews = await reviewRepo.list(propertyId);
  return computeReviewStats(reviews);
}

/**
 * 複数物件の集計をまとめて取得（カタログ一覧用）。D1 でも JSON でも
 * 全件を1回だけ読み込んでメモリ上で集計するため、物件数ぶんクエリを
 * 発行しない。
 */
export async function reviewStatsForProperties(
  propertyIds: string[],
): Promise<Record<string, ReviewStats>> {
  const ids = new Set(propertyIds);
  const all = await reviewRepo.listAll();
  const byProperty = new Map<string, Review[]>();
  for (const r of all) {
    if (!ids.has(r.propertyId)) continue;
    const list = byProperty.get(r.propertyId);
    if (list) list.push(r);
    else byProperty.set(r.propertyId, [r]);
  }
  const out: Record<string, ReviewStats> = {};
  for (const id of propertyIds) {
    out[id] = computeReviewStats(byProperty.get(id) ?? []);
  }
  return out;
}
