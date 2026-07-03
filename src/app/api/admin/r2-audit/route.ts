import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { repo as propertyRepo, assetRepo } from "@/lib/store";
import { getR2Bucket } from "@/lib/r2-store";

export const runtime = "nodejs";

/** 保存済みURL（公開r2.dev / 相対 /uploads / /api/r2 ...）から R2 オブジェクトキーを導く。 */
function toR2Key(url: string): string | null {
  if (!url) return null;
  let path = url;
  if (/^https?:\/\//.test(url)) {
    try {
      path = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/+/, "").replace(/^api\/r2\//, "");
  return path || null;
}

/** オブジェクト内の url/src っぽいキーの文字列値を再帰的に集める。 */
function collectUrls(obj: unknown, out: Set<string>): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const v of obj) collectUrls(v, out);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string" && /url|src/i.test(k) && v) {
      out.add(v);
    } else if (v && typeof v === "object") {
      collectUrls(v, out);
    }
  }
}

/**
 * R2 バケット全体をスキャンし、物件/アセットライブラリのどこからも参照
 * されていないオブジェクト（孤児候補）を洗い出す管理者専用の読み取り専用診断。
 * 削除は一切行わない。
 */
export async function GET() {
  await requireAdmin();

  const bucket = await getR2Bucket();
  if (!bucket) {
    return NextResponse.json({ error: "R2 バケットが利用できません" }, { status: 503 });
  }

  // 1) バケット内の全オブジェクトを列挙。
  const objects: { key: string; size: number; uploaded: string }[] = [];
  let cursor: string | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const listing = await bucket.list({ cursor, limit: 1000 });
    for (const o of listing.objects as {
      key: string;
      size: number;
      uploaded: string | Date;
    }[]) {
      objects.push({
        key: o.key,
        size: o.size,
        uploaded:
          typeof o.uploaded === "string" ? o.uploaded : o.uploaded.toISOString(),
      });
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  // 2) 参照元を収集: 物件の全フィールド + アセットライブラリの r2Key/url。
  const [properties, assets] = await Promise.all([
    propertyRepo.list(),
    assetRepo.list(),
  ]);

  const referencedKeys = new Set<string>();
  for (const p of properties) {
    const urls = new Set<string>();
    collectUrls(p, urls);
    for (const u of urls) {
      const k = toR2Key(u);
      if (k) referencedKeys.add(k);
    }
  }
  for (const a of assets) {
    if (a.r2Key) referencedKeys.add(a.r2Key);
    const k = toR2Key(a.url);
    if (k) referencedKeys.add(k);
    const tk = toR2Key(a.thumbnailUrl);
    if (tk) referencedKeys.add(tk);
  }

  // 3) 旧本番ストア（D1移行前のR2-JSONシード元）は現在の参照グラフに乗らないが、
  //    ファイルアップロードの取りこぼしではなく既知の経緯があるので別枠で報告する。
  const LEGACY_PREFIXES = ["_properties/", "_assets/", "users/"];
  const legacy: typeof objects = [];
  const orphans: typeof objects = [];
  const referenced: typeof objects = [];
  for (const o of objects) {
    if (referencedKeys.has(o.key)) {
      referenced.push(o);
    } else if (LEGACY_PREFIXES.some((p) => o.key.startsWith(p))) {
      legacy.push(o);
    } else {
      orphans.push(o);
    }
  }

  const sum = (arr: typeof objects) => arr.reduce((s, o) => s + o.size, 0);
  const byPrefix = (arr: typeof objects) => {
    const map = new Map<string, { count: number; bytes: number; sample: typeof objects }>();
    for (const o of arr) {
      const prefix = o.key.split("/").slice(0, -1).join("/") || "(root)";
      const e = map.get(prefix) ?? { count: 0, bytes: 0, sample: [] };
      e.count++;
      e.bytes += o.size;
      if (e.sample.length < 8) e.sample.push(o);
      map.set(prefix, e);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([prefix, e]) => ({ prefix, ...e }));
  };

  return NextResponse.json({
    totals: {
      objectCount: objects.length,
      totalBytes: sum(objects),
      referencedCount: referenced.length,
      referencedBytes: sum(referenced),
      legacyCount: legacy.length,
      legacyBytes: sum(legacy),
      orphanCount: orphans.length,
      orphanBytes: sum(orphans),
    },
    orphansByPrefix: byPrefix(orphans),
    legacyByPrefix: byPrefix(legacy),
  });
}
