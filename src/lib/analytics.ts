/**
 * Lightweight view analytics for studios — captures detail-page views,
 * 3DGS viewer opens, referrer source, and per-day buckets so the admin can
 * read demand / contract trends. Dev impl writes `data/analytics.json`
 * (gitignored); migrates to D1 later, same interface.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "analytics.json");

export type TrackType = "view" | "viewer_open";

export type DeviceKind = "mobile" | "tablet" | "desktop";

export interface PropStats {
  views: number;
  opens: number;
  /** day(YYYY-MM-DD) -> { v: views, o: opens } */
  daily: Record<string, { v: number; o: number }>;
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

async function read(): Promise<Store> {
  try {
    const s = JSON.parse(await fs.readFile(FILE, "utf8")) as Store;
    // 旧データには devices が無いので補完。
    for (const p of Object.values(s.properties)) {
      if (!p.devices) p.devices = {};
    }
    return s;
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "ENOENT"
    ) {
      return { version: 1, properties: {} };
    }
    throw e;
  }
}

async function write(s: Store): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(s, null, 2), "utf8");
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
): Promise<void> {
  const s = await read();
  const p: PropStats =
    s.properties[propertyId] ??
    ({ views: 0, opens: 0, daily: {}, referrers: {}, devices: {}, lastAt: "" } as PropStats);
  if (!p.devices) p.devices = {};

  if (type === "view") p.views += 1;
  else p.opens += 1;

  const d = p.daily[day] ?? { v: 0, o: 0 };
  if (type === "view") d.v += 1;
  else d.o += 1;
  p.daily[day] = d;

  if (type === "view") {
    const src = classifyReferrer(referrer);
    p.referrers[src] = (p.referrers[src] ?? 0) + 1;
  }

  p.devices[device] = (p.devices[device] ?? 0) + 1;

  p.lastAt = new Date().toISOString();
  s.properties[propertyId] = p;
  await write(s);
}

export async function getAllStats(): Promise<Record<string, PropStats>> {
  return (await read()).properties;
}
