/**
 * サインイン済みユーザー向けのアプリ内通知（例: 問い合わせへの返信）。
 * dev impl は `data/notifications.json`（gitignored）、本番は D1
 * `notifications` テーブル（migrations/0008）。
 *
 * メールが主経路（問い合わせは匿名でも送れるため）で、これは「サインイン
 * 済みなら追加で気づける」ための補助チャンネル。userId が無い（匿名）
 * 問い合わせには通知を作らない。
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1 } from "./d1";

export interface Notification {
  id: string;
  userId: string;
  /**
   * inquiry_reply=問い合わせ返信（申請者へ） / inquiry_new=物件問い合わせの新着（運営へ） /
   * publish_request=スタジオからの公開申請 /
   * scan_submission=持ち込みスキャンの新規申請（運営へ） /
   * scan_status=持ち込みスキャンの状態変更（申請者へ） /
   * contact_request=サイト全体お問い合わせの新着（運営へ） /
   * production_request=制作会社(NDA)アカウント申請の新着（運営へ） /
   * production_status=制作会社(NDA)アカウント申請の結果（申請者へ） /
   * policy_update=規約・条件変更のお知らせ（掲載者・利用者へ）
   */
  type:
    | "inquiry_reply"
    | "inquiry_new"
    | "publish_request"
    | "scan_submission"
    | "scan_status"
    | "contact_request"
    | "production_request"
    | "production_status"
    | "policy_update";
  title: string;
  body: string;
  /** クリック時の遷移先（相対パス）。 */
  link: string;
  read: boolean;
  createdAt: string;
}

const FILE = path.join(process.cwd(), "data", "notifications.json");
const TABLE = "notifications";

interface Store {
  version: 1;
  notifications: Notification[];
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as Store;
  } catch {
    return { version: 1, notifications: [] };
  }
}

async function writeStore(s: Store): Promise<void> {
  await safeWriteFile(FILE, JSON.stringify(s, null, 2));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToNotification(r: Record<string, any>): Notification {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    read: !!r.read,
    createdAt: r.created_at,
  };
}

export async function createNotification(
  n: Omit<Notification, "id" | "read" | "createdAt">,
): Promise<void> {
  const full: Notification = {
    ...n,
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
  };
  if (canAccessLocalFs()) {
    const s = await readStore();
    s.notifications.push(full);
    await writeStore(s);
    return;
  }
  const db = await getD1();
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO ${TABLE} (id, user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(full.id, full.userId, full.type, full.title, full.body, full.link, 0, full.createdAt)
    .run();
}

export async function listNotifications(userId: string, limit = 30): Promise<Notification[]> {
  if (canAccessLocalFs()) {
    const s = await readStore();
    return s.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  const db = await getD1();
  if (!db) return [];
  const res = await db
    .prepare(`SELECT * FROM ${TABLE} WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(userId, limit)
    .all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((res?.results ?? []) as Record<string, any>[]);
  return rows.map(rowToNotification);
}

export async function markAllRead(userId: string): Promise<void> {
  if (canAccessLocalFs()) {
    const s = await readStore();
    let changed = false;
    for (const n of s.notifications) {
      if (n.userId === userId && !n.read) {
        n.read = true;
        changed = true;
      }
    }
    if (changed) await writeStore(s);
    return;
  }
  const db = await getD1();
  if (!db) return;
  await db.prepare(`UPDATE ${TABLE} SET read = 1 WHERE user_id = ? AND read = 0`).bind(userId).run();
}
