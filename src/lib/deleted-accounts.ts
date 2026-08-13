/**
 * 削除アカウントのアーカイブ。
 *
 * 管理画面の「削除」は物理削除ではなく、理由の入力を必須にしたうえで
 * ここへ完全なスナップショット（削除時点の User レコード全体）を退避してから
 * users から行を消す、という二段構えにしている。誤操作しても内容が残り、
 * 「誰が・いつ・なぜ消したか」も後から辿れる。
 *
 * 保存方式の判断（users への soft-delete 列追加を採らなかった理由）は
 * migrations/0017_deleted_accounts.sql の冒頭コメントに記録してある。
 * 保存は他リポジトリと同じ D1/ローカルJSON ハイブリッド行モデル
 * （実カラム + data 列の完全JSON）。
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1ListData, d1Upsert, type D1 } from "./d1";
import { userSchema, type User } from "./account-schema";

const DATA_FILE = path.join(process.cwd(), "data", "deleted-accounts.json");
const TABLE = "deleted_accounts";

export const deletedAccountSchema = z.object({
  /** 削除された Clerk userId（= 元 User.id）。 */
  id: z.string().min(1),
  email: z.string().default(""),
  name: z.string().default(""),
  /** 削除理由（管理者の自由記述）。空では削除できない。 */
  reason: z.string().min(1).max(1000),
  deletedAt: z.string(),
  /** 実行した管理者の userId / メール。 */
  deletedBy: z.string().default(""),
  deletedByEmail: z.string().default(""),
  /** 削除時点の User レコード全体（復旧の materials）。 */
  snapshot: userSchema,
});
export type DeletedAccount = z.infer<typeof deletedAccountSchema>;

interface StoreShape {
  version: 1;
  accounts: DeletedAccount[];
}

async function fileReadAll(): Promise<DeletedAccount[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.accounts ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(accounts: DeletedAccount[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, accounts }, null, 2));
}

/** D1 の実カラム抽出（migrations/0017 の列と一致させること）。 */
function deletedCols(a: DeletedAccount): Record<string, string | number | null> {
  return {
    id: a.id,
    email_lower: (a.email ?? "").toLowerCase(),
    deleted_at: a.deletedAt,
    deleted_by: a.deletedBy || null,
  };
}

export const deletedAccountRepo = {
  async list(): Promise<DeletedAccount[]> {
    let out: DeletedAccount[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
    } else {
      const db = await getD1();
      if (!db) return [];
      out = await d1ListData<DeletedAccount>(db, TABLE).catch(() => []);
    }
    return out.sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  },

  /** 削除直前のユーザーをアーカイブする。理由が空なら zod が弾く。 */
  async archive(input: {
    user: User;
    reason: string;
    deletedBy: string;
    deletedByEmail?: string;
  }): Promise<DeletedAccount> {
    const validated = deletedAccountSchema.parse({
      id: input.user.id,
      email: input.user.email,
      name: input.user.name,
      reason: input.reason.trim(),
      deletedAt: new Date().toISOString(),
      deletedBy: input.deletedBy,
      deletedByEmail: input.deletedByEmail ?? "",
      snapshot: input.user,
    });
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const db: D1 | null = await getD1();
    if (!db) throw new Error("削除アカウントの保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "id", deletedCols(validated), validated);
    return validated;
  },
};
