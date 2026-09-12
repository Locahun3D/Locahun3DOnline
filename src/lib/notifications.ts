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
import { notificationScope, type NotificationScope } from "./notification-scope";

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

export async function listNotifications(userId: string, limit = 30, scope?: NotificationScope): Promise<Notification[]> {
  let notifications: Notification[];
  if (canAccessLocalFs()) {
    const s = await readStore();
    notifications = s.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
  const db = await getD1();
  if (!db) return [];
  const res = await db
    .prepare(`SELECT * FROM ${TABLE} WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((res?.results ?? []) as Record<string, any>[]);
  notifications = rows.map(rowToNotification);
  }
  // Scope filtering precedes source lookups and display limits. Omitted scope
  // retains the legacy repository API used for policy-notice deduplication.
  if (scope) notifications = notifications.filter(n => notificationScope(n) === scope);
  // Derive visibility from the source so already archived historical notices also
  // disappear. Do not delete notifications: restoring an inquiry restores its notice.
  const [contacts, inquiries] = await Promise.all([
    notifications.some(n => n.type === "contact_request")
      ? import("./contact-requests").then(m => m.contactRequestRepo.list()) : [],
    notifications.some(n => n.type === "inquiry_new")
      ? import("./inquiries").then(m => m.inquiryRepo.list()) : [],
  ]);
  return notifications.filter(n => {
    if (n.type !== "contact_request" && n.type !== "inquiry_new") return true;
    const rows = n.type === "contact_request" ? contacts : inquiries;
    const id = n.link.split("#")[1];
    if (id) return rows.some(row => row.id === id && row.status !== "archived");
    // Older notices had no source ID. Only hide an unambiguous archived match;
    // a similarly worded active request must never lose its notification.
    const matches = rows.filter(row => n.body === ("propertyTitle" in row
      ? `${row.name || "匿名"} さん（${row.propertyTitle}）: ${row.message.slice(0, 120)}`
      : `${row.name || "匿名"} さん: ${row.message.slice(0, 120)}`));
    return matches.length === 0 || matches.some(row => row.status !== "archived");
  }).slice(0, limit);
}

export async function getNotificationSummary(userId: string, scope: NotificationScope, limit = 30) {
  const visible = await listNotifications(userId, Infinity, scope);
  return { notifications: visible.slice(0, limit), unreadCount: visible.filter(n => !n.read).length };
}

export async function markAllRead(userId: string, scope: NotificationScope): Promise<void> {
  if (scope !== "user" && scope !== "admin") throw new Error("Invalid notification scope");
  // Update a visible snapshot only. Archived notices stay unread if restored,
  // and arrivals after this snapshot do not get silently marked as read.
  const ids = (await listNotifications(userId, Infinity, scope)).filter(n => !n.read).map(n => n.id);
  if (!ids.length) return;
  const selected = new Set(ids);
  if (canAccessLocalFs()) {
    const s = await readStore();
    let changed = false;
    for (const n of s.notifications) {
      if (n.userId === userId && !n.read && selected.has(n.id) && notificationScope(n) === scope) {
        n.read = true;
        changed = true;
      }
    }
    if (changed) await writeStore(s);
    return;
  }
  const db = await getD1();
  if (!db) return;
  const statements = [];
  for (let offset = 0; offset < ids.length; offset += 90) {
    const batch = ids.slice(offset, offset + 90);
    statements.push(db.prepare(`UPDATE ${TABLE} SET read = 1 WHERE user_id = ? AND read = 0 AND id IN (${batch.map(() => "?").join(",")})`).bind(userId, ...batch));
  }
  // D1 batch is transactional: a later chunk failing must not partially mark
  // earlier chunks as read while the UI reports that the operation failed.
  await db.batch(statements);
}
