/**
 * Lightweight view analytics for studios — captures detail-page views,
 * 3DGS viewer opens, referrer source, and per-day buckets so the admin can
 * read demand / contract trends. Dev impl writes `data/analytics.json`
 * (gitignored); migrates to D1 later, same interface.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { r2DocGet } from "./r2-store";
import { getD1, d1SeedOnce, type D1 } from "./d1";

const FILE = path.join(process.cwd(), "data", "analytics.json");
const R2_DOC_KEY = "_analytics.json"; // 旧本番ストア（D1 への初回シード元）

export type TrackType = "view" | "viewer_open" | "purchase" | "refund";

export type DeviceKind = "mobile" | "tablet" | "desktop";

export interface PropStats {
  views: number;
  opens: number;
  purchases: number;
  refunds: number;
  revenue: number;
  /** day(YYYY-MM-DD) -> { v: views, o: opens, p: purchases, r: refunds, rev: revenue } */
  daily: Record<string, { v: number; o: number; p?: number; r?: number; rev?: number }>;
  /** referrer source -> count (views only) */
  referrers: Record<string, number>;
  /** device kind -> count (views + opens) */
  devices: Record<string, number>;
  lastAt: string;
}

/** Coarse device classification from a User-Agent string. */
export function parseDevice(ua: string): DeviceKind {
  const s = (ua || "").toLowerCase();
  if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobi))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobi|windows phone|blackberry/.test(s)) return "mobile";
  return "desktop";
}

export const DEVICE_LABEL: Record<DeviceKind, string> = {
  mobile: "スマートフォン",
  tablet: "タブレット",
  desktop: "PC",
};

interface Store {
  version: 1;
  properties: Record<string, PropStats>;
}

function withDevices(s: Store): Store {
  if (s.properties) {
    for (const p of Object.values(s.properties)) {
      if (!p.devices) p.devices = {};
    }
  }
  return s.properties ? s : { version: 1, properties: {} };
}

function fallbackStore(): Store {
  return { version: 1, properties: {} };
}

// ── dev（ローカルファイル）: 単一プロセス前提の read-modify-write ──
async function read(): Promise<Store> {
  try {
    return withDevices(JSON.parse(await fs.readFile(FILE, "utf8")) as Store);
  } catch {
    return fallbackStore();
  }
}

async function write(s: Store): Promise<void> {
  await safeWriteFile(FILE, JSON.stringify(s, null, 2));
}

// ── deployed（Workers）: D1 のカウンタ正規化テーブル ──
// track() を UPSERT インクリメントの batch(=トランザクション)にすることで、
// 同時 track の read-modify-write レース(全体クロバー)を解消する。

/** D1 が空なら旧本番(R2 doc)/seed を正規化テーブルへ非破壊で初回投入。 */
let _seeded = false;
async function ensureSeeded(db: D1): Promise<void> {
  if (_seeded) return;
  await d1SeedOnce(db, "analytics_prop", () => seedFromR2(db));
  _seeded = true;
}

async function seedFromR2(db: D1): Promise<void> {
  const fromR2 = await r2DocGet<Store>(R2_DOC_KEY).catch(() => null);
  const store = fromR2 ? withDevices(fromR2) : fallbackStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stmts: any[] = [];
  for (const [pid, p] of Object.entries(store.properties ?? {})) {
    stmts.push(
      db
        .prepare(
          "INSERT INTO analytics_prop (property_id, views, opens, purchases, refunds, revenue, last_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(property_id) DO NOTHING",
        )
        .bind(pid, p.views ?? 0, p.opens ?? 0, p.purchases ?? 0, p.refunds ?? 0, p.revenue ?? 0, p.lastAt ?? ""),
    );
    for (const [day, d] of Object.entries(p.daily ?? {})) {
      stmts.push(
        db
          .prepare(
            "INSERT INTO analytics_daily (property_id, day, v, o, p, r, rev) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(property_id, day) DO NOTHING",
          )
          .bind(pid, day, d.v ?? 0, d.o ?? 0, d.p ?? 0, d.r ?? 0, d.rev ?? 0),
      );
    }
    for (const [src, c] of Object.entries(p.referrers ?? {})) {
      stmts.push(
        db
          .prepare(
            "INSERT INTO analytics_referrer (property_id, source, count) VALUES (?, ?, ?) " +
              "ON CONFLICT(property_id, source) DO NOTHING",
          )
          .bind(pid, src, c as number),
      );
    }
    for (const [dev, c] of Object.entries(p.devices ?? {})) {
      stmts.push(
        db
          .prepare(
            "INSERT INTO analytics_device (property_id, device, count) VALUES (?, ?, ?) " +
              "ON CONFLICT(property_id, device) DO NOTHING",
          )
          .bind(pid, dev, c as number),
      );
    }
  }
  if (stmts.length) await db.batch(stmts);
}

/** 正規化テーブルから PropStats マップを再構成する（getAllStats 用）。 */
async function assembleFromD1(db: D1): Promise<Record<string, PropStats>> {
  const out: Record<string, PropStats> = {};
  const ensure = (id: string): PropStats =>
    (out[id] ??= {
      views: 0, opens: 0, purchases: 0, refunds: 0, revenue: 0,
      daily: {}, referrers: {}, devices: {}, lastAt: "",
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = async (sql: string): Promise<any[]> =>
    ((await db.prepare(sql).all())?.results ?? []) as any[];

  for (const r of await rows("SELECT * FROM analytics_prop")) {
    const p = ensure(r.property_id);
    p.views = r.views; p.opens = r.opens; p.purchases = r.purchases;
    p.refunds = r.refunds; p.revenue = r.revenue; p.lastAt = r.last_at ?? "";
  }
  for (const r of await rows("SELECT * FROM analytics_daily")) {
    ensure(r.property_id).daily[r.day] = { v: r.v, o: r.o, p: r.p, r: r.r, rev: r.rev };
  }
  for (const r of await rows("SELECT * FROM analytics_referrer")) {
    ensure(r.property_id).referrers[r.source] = r.count;
  }
  for (const r of await rows("SELECT * FROM analytics_device")) {
    ensure(r.property_id).devices[r.device] = r.count;
  }
  return out;
}

/** Map a referrer URL to a coarse source label. */
export function classifyReferrer(ref: string): string {
  if (!ref) return "直接 / アプリ内";
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    if (h.includes("google")) return "Google";
    if (h.includes("yahoo")) return "Yahoo";
    if (h.includes("bing")) return "Bing";
    if (h === "t.co" || h.includes("twitter") || h === "x.com") return "X / Twitter";
    if (h.includes("facebook") || h === "fb.com") return "Facebook";
    if (h.includes("instagram")) return "Instagram";
    if (h.includes("youtube") || h === "youtu.be") return "YouTube";
    if (h.includes("locahun3d.com")) return "ロケハン3D 内";
    return h;
  } catch {
    return "その他";
  }
}

export async function track(
  propertyId: string,
  type: TrackType,
  referrer: string,
  day: string,
  device: DeviceKind = "desktop",
  amountYen: number = 0,
): Promise<void> {
  // dev: 単一プロセスなので従来の read-modify-write で十分。
  if (canAccessLocalFs()) {
    const s = await read();
    const p: PropStats =
      s.properties[propertyId] ??
      ({ views: 0, opens: 0, purchases: 0, refunds: 0, revenue: 0, daily: {}, referrers: {}, devices: {}, lastAt: "" } as PropStats);
    if (!p.devices) p.devices = {};
    if (!p.purchases) p.purchases = 0;
    if (!p.refunds) p.refunds = 0;
    if (!p.revenue) p.revenue = 0;

    if (type === "view") p.views += 1;
    else if (type === "viewer_open") p.opens += 1;
    else if (type === "purchase") { p.purchases += 1; p.revenue += amountYen; }
    else if (type === "refund") { p.refunds += 1; p.revenue -= amountYen; }

    const d = p.daily[day] ?? { v: 0, o: 0 };
    if (type === "view") d.v += 1;
    else if (type === "viewer_open") d.o += 1;
    else if (type === "purchase") { d.p = (d.p ?? 0) + 1; d.rev = (d.rev ?? 0) + amountYen; }
    else if (type === "refund") { d.r = (d.r ?? 0) + 1; d.rev = (d.rev ?? 0) - amountYen; }
    p.daily[day] = d;

    if (type === "view") {
      const src = classifyReferrer(referrer);
      p.referrers[src] = (p.referrers[src] ?? 0) + 1;
    }
    if (type === "view" || type === "viewer_open") {
      p.devices[device] = (p.devices[device] ?? 0) + 1;
    }
    p.lastAt = new Date().toISOString();
    s.properties[propertyId] = p;
    await write(s);
    return;
  }

  // deployed: D1 の UPSERT インクリメントを batch(=トランザクション)で原子的に加算。
  const db = await getD1();
  if (!db) return;
  await ensureSeeded(db);
  const now = new Date().toISOString();
  const dv = type === "view" ? 1 : 0;
  const dopen = type === "viewer_open" ? 1 : 0;
  const dp = type === "purchase" ? 1 : 0;
  const dr = type === "refund" ? 1 : 0;
  const drev = type === "purchase" ? amountYen : type === "refund" ? -amountYen : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stmts: any[] = [
    db
      .prepare(
        "INSERT INTO analytics_prop (property_id, views, opens, purchases, refunds, revenue, last_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(property_id) DO UPDATE SET " +
          "views=views+excluded.views, opens=opens+excluded.opens, purchases=purchases+excluded.purchases, " +
          "refunds=refunds+excluded.refunds, revenue=revenue+excluded.revenue, last_at=excluded.last_at",
      )
      .bind(propertyId, dv, dopen, dp, dr, drev, now),
    db
      .prepare(
        "INSERT INTO analytics_daily (property_id, day, v, o, p, r, rev) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(property_id, day) DO UPDATE SET " +
          "v=v+excluded.v, o=o+excluded.o, p=p+excluded.p, r=r+excluded.r, rev=rev+excluded.rev",
      )
      .bind(propertyId, day, dv, dopen, dp, dr, drev),
  ];
  if (type === "view") {
    stmts.push(
      db
        .prepare(
          "INSERT INTO analytics_referrer (property_id, source, count) VALUES (?, ?, 1) " +
            "ON CONFLICT(property_id, source) DO UPDATE SET count=count+1",
        )
        .bind(propertyId, classifyReferrer(referrer)),
    );
  }
  if (type === "view" || type === "viewer_open") {
    stmts.push(
      db
        .prepare(
          "INSERT INTO analytics_device (property_id, device, count) VALUES (?, ?, 1) " +
            "ON CONFLICT(property_id, device) DO UPDATE SET count=count+1",
        )
        .bind(propertyId, device),
    );
  }
  await db.batch(stmts);
}

export async function getAllStats(): Promise<Record<string, PropStats>> {
  if (canAccessLocalFs()) return (await read()).properties;
  const db = await getD1();
  if (!db) return {};
  await ensureSeeded(db);
  return assembleFromD1(db);
}
