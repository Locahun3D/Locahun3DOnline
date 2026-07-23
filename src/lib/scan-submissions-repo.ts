import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, type D1 } from "./d1";
import {
  scanSubmissionSchema,
  type ScanSubmission,
  type ScanSubmissionStatus,
} from "./scan-submissions";

/**
 * 持ち込みスキャン申請の永続化。property-previews.ts と同じ D1/ローカルJSON
 * ハイブリッド行モデル（実カラム + data 列の完全JSON、migrations/0013 冒頭
 * コメント参照）。テーブル定義は migrations/0015_scan_submissions.sql。
 */
const DATA_FILE = path.join(process.cwd(), "data", "scan-submissions.json");
const TABLE = "scan_submissions";

interface StoreShape {
  version: 1;
  submissions: ScanSubmission[];
}

async function fileReadAll(): Promise<ScanSubmission[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as StoreShape;
    return s.submissions ?? [];
  } catch {
    return [];
  }
}

async function fileWriteAll(submissions: ScanSubmission[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, submissions }, null, 2));
}

function submissionCols(s: ScanSubmission): Record<string, string | number | null> {
  return {
    id: s.id,
    user_id: s.userId,
    status: s.status,
    created_at: s.createdAt,
  };
}

export const scanSubmissionRepo = {
  async list(opts?: { userId?: string; status?: ScanSubmissionStatus }): Promise<ScanSubmission[]> {
    let out: ScanSubmission[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
    } else {
      const db = await getD1();
      if (!db) return [];
      out = await d1ListData<ScanSubmission>(db, TABLE);
    }
    if (opts?.userId) out = out.filter((s) => s.userId === opts.userId);
    if (opts?.status) out = out.filter((s) => s.status === opts.status);
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<ScanSubmission | null> {
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      return all.find((s) => s.id === id) ?? null;
    }
    const db = await getD1();
    if (!db) return null;
    return d1GetData<ScanSubmission>(db, TABLE, "id", id);
  },

  async upsert(s: ScanSubmission): Promise<ScanSubmission> {
    const validated = scanSubmissionSchema.parse(s);
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const db: D1 | null = await getD1();
    if (!db) throw new Error("持ち込みスキャン申請の保存先 (D1) が利用できません");
    await d1Upsert(db, TABLE, "id", submissionCols(validated), validated);
    return validated;
  },
};
