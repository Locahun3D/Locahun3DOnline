/**
 * 個別イベントログ（analytics.ts の集計カウンタとは別系統）。
 * 「誰が見たか」を管理画面で辿れるようにするための追加記録。
 * dev impl は `data/analytics-events.json`（gitignored）、本番は D1
 * `analytics_events` テーブル（migrations/0007）。
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1 } from "./d1";
import type { TrackType, DeviceKind } from "./analytics";

export interface AnalyticsEvent {
  id: string;
  propertyId: string;
  type: TrackType;
  /** サインイン済みユーザーのみ設定。匿名の閲覧は null のまま。 */
  userId: string | null;
  userEmail: string | null;
  referrer: string;
  device: DeviceKind;
  createdAt: string;
}

const FILE = path.join(process.cwd(), "data", "analytics-events.json");
const TABLE = "analytics_events";
/** dev用JSONファイルが際限なく育たないようにする軽いキャップ（本番D1には適用しない）。 */
const MAX_EVENTS_DEV = 5000;

interface Store {
  version: 1;
  events: AnalyticsEvent[];
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as Store;
  } catch {
    return { version: 1, events: [] };
  }
}

async function writeStore(s: Store): Promise<void> {
  await safeWriteFile(FILE, JSON.stringify(s, null, 2));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEvent(r: Record<string, any>): AnalyticsEvent {
  return {
    id: r.id,
    propertyId: r.property_id,
    type: r.type,
    userId: r.user_id || null,
    userEmail: r.user_email || null,
    referrer: r.referrer || "",
    device: r.device || "desktop",
    createdAt: r.created_at,
  };
}

/**
 * 個別イベントを1行記録する。失敗しても集計カウンタ側（analytics.ts の
 * track()）を止めないよう、呼び出し側で catch して握りつぶす前提。
 *
 * ⚠ 無期限に行が増え続ける実装。現状の規模を前提に未対応 — 将来的に
 * 規模が増えたら古いイベントを間引く仕組み（例: cron で90日超を削除）が必要。
 */
export async function logEvent(e: Omit<AnalyticsEvent, "id">): Promise<void> {
  const withId: AnalyticsEvent = { ...e, id: crypto.randomUUID() };
  if (canAccessLocalFs()) {
    const s = await readStore();
    s.events.push(withId);
    if (s.events.length > MAX_EVENTS_DEV) s.events = s.events.slice(-MAX_EVENTS_DEV);
    await writeStore(s);
    return;
  }
  const db = await getD1();
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO ${TABLE} (id, property_id, type, user_id, user_email, referrer, device, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      withId.id,
      withId.propertyId,
      withId.type,
      withId.userId,
      withId.userEmail,
      withId.referrer,
      withId.device,
      withId.createdAt,
    )
    .run();
}

/** 直近N件を新しい順で返す（管理画面「最近の閲覧者」用。物件で絞り込み可）。 */
export async function listRecentEvents(opts?: {
  propertyId?: string;
  limit?: number;
}): Promise<AnalyticsEvent[]> {
  const limit = opts?.limit ?? 100;
  if (canAccessLocalFs()) {
    const s = await readStore();
    let events = s.events;
    if (opts?.propertyId) events = events.filter((e) => e.propertyId === opts.propertyId);
    return [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  const db = await getD1();
  if (!db) return [];
  const sql = opts?.propertyId
    ? `SELECT * FROM ${TABLE} WHERE property_id = ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM ${TABLE} ORDER BY created_at DESC LIMIT ?`;
  const stmt = opts?.propertyId
    ? db.prepare(sql).bind(opts.propertyId, limit)
    : db.prepare(sql).bind(limit);
  const res = await stmt.all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((res?.results ?? []) as Record<string, any>[]);
  return rows.map(rowToEvent);
}
