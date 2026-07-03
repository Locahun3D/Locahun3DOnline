import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { repo as propertyRepo, assetRepo } from "@/lib/store";
import { getR2Bucket } from "@/lib/r2-store";
import { deleteR2Object } from "@/lib/uploads";

export const runtime = "nodejs";

/**
 * 保存済みURL（公開r2.dev / 相対 /uploads / /api/r2/... / /api/demo-asset/... 等）
 * から R2 オブジェクトキーを導く。
 */
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
  path = path
    .replace(/^\/+/, "")
    .replace(/^api\/r2\//, "")
    .replace(/^api\/demo-asset\//, "");
  return path || null;
}

/**
 * D1移行前の「旧本番ストア（R2-JSON、D1への初回シード元のみ）」。各リポジトリの
 * ensure*Seeded()/seedValue() が最初の1回だけ読み、以降は完全に不使用になる。
 * アップロードの取りこぼしではなく既知の設計上の残骸なので orphan と区別する。
 */
const LEGACY_PREFIXES = ["_properties/", "_assets/", "users/", "inquiries/"];
const LEGACY_EXACT_KEYS = new Set(["_analytics.json", "site-settings.json"]);

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

type R2ObjInfo = { key: string; size: number; uploaded: string };

/** バケット全体を列挙し、参照済み/legacy/孤児候補に分類する（GET・POST 共用）。 */
async function classifyBucket(): Promise<{
  objects: R2ObjInfo[];
  referenced: R2ObjInfo[];
  legacy: R2ObjInfo[];
  orphans: R2ObjInfo[];
} | null> {
  const bucket = await getR2Bucket();
  if (!bucket) return null;

  // 1) バケット内の全オブジェクトを列挙。
  const objects: R2ObjInfo[] = [];
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
  const legacy: R2ObjInfo[] = [];
  const orphans: R2ObjInfo[] = [];
  const referenced: R2ObjInfo[] = [];
  for (const o of objects) {
    if (referencedKeys.has(o.key)) {
      referenced.push(o);
    } else if (
      LEGACY_PREFIXES.some((p) => o.key.startsWith(p)) ||
      LEGACY_EXACT_KEYS.has(o.key)
    ) {
      legacy.push(o);
    } else {
      orphans.push(o);
    }
  }

  return { objects, referenced, legacy, orphans };
}

const sum = (arr: R2ObjInfo[]) => arr.reduce((s, o) => s + o.size, 0);
const byPrefix = (arr: R2ObjInfo[]) => {
  const map = new Map<string, { count: number; bytes: number; sample: R2ObjInfo[] }>();
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

/**
 * R2 バケット全体をスキャンし、物件/アセットライブラリのどこからも参照
 * されていないオブジェクト（孤児候補）を洗い出す管理者専用の読み取り専用診断。
 * 削除は一切行わない。
 */
export async function GET() {
  await requireAdmin();
  const c = await classifyBucket();
  if (!c) return NextResponse.json({ error: "R2 バケットが利用できません" }, { status: 503 });

  return NextResponse.json({
    totals: {
      objectCount: c.objects.length,
      totalBytes: sum(c.objects),
      referencedCount: c.referenced.length,
      referencedBytes: sum(c.referenced),
      legacyCount: c.legacy.length,
      legacyBytes: sum(c.legacy),
      orphanCount: c.orphans.length,
      orphanBytes: sum(c.orphans),
    },
    orphansByPrefix: byPrefix(c.orphans),
    legacyByPrefix: byPrefix(c.legacy),
  });
}

/**
 * 明示的に渡されたキーだけを削除する。GET と同じ分類を今この時点で再計算し、
 * 「今まさに孤児候補として検出されているキー」以外は必ずスキップする
 * （呼び出し元の指定ミスで参照中/レガシーのファイルを消さないための二重確認）。
 */
export async function POST(req: Request) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const keys = Array.isArray(body?.keys) ? (body.keys as unknown[]).filter((k): k is string => typeof k === "string") : [];
  if (keys.length === 0) {
    return NextResponse.json({ error: "keys is required" }, { status: 400 });
  }

  const c = await classifyBucket();
  if (!c) return NextResponse.json({ error: "R2 バケットが利用できません" }, { status: 503 });
  const orphanKeys = new Set(c.orphans.map((o) => o.key));

  const deleted: string[] = [];
  const skipped: { key: string; reason: string }[] = [];
  for (const key of keys) {
    if (!orphanKeys.has(key)) {
      skipped.push({ key, reason: "not currently classified as orphan" });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await deleteR2Object(key);
      deleted.push(key);
    } catch (e) {
      skipped.push({ key, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ deleted, skipped });
}
