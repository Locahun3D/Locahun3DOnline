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
import { r2DocGet, r2DocPut } from "./r2-store";
import _analyticsFallback from "../../data/analytics.json";

const FILE = path.join(process.cwd(), "data", "analytics.json");
const R2_DOC_KEY = "_analytics.json";

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
  return withDevices(_analyticsFallback as unknown as Store);
}

async function read(): Promise<Store> {
  if (!canAccessLocalFs()) {
    // Workers: R2 が真。未保存（初回）はバンドルのスナップショットを種にする。
    const fromR2 = await r2DocGet<Store>(R2_DOC_KEY);
    return fromR2 ? withDevices(fromR2) : fallbackStore();
  }
  try {
    return withDevices(JSON.parse(await fs.readFile(FILE, "utf8")) as Store);
  } catch {
    return fallbackStore();
  }
}

async function write(s: Store): Promise<void> {
  if (canAccessLocalFs()) {
    await safeWriteFile(FILE, JSON.stringify(s, null, 2));
  } else {
    await r2DocPut(R2_DOC_KEY, s);
  }
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
}

export async function getAllStats(): Promise<Record<string, PropStats>> {
  return (await read()).properties;
}
