import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 稼働監視用のヘルスチェック（認証不要）。外形監視(uptime monitor)から叩き、
 * D1 と R2 への疎通を確認する。健全なら 200、いずれか異常なら 503。
 * 機密は返さない（各サブシステムの ok/error のみ）。
 */
export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    const { env } = await getCloudflareContext();
    const e = env as Record<string, unknown>;

    // D1
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = e.DB as any;
      if (!db) {
        checks.d1 = "unbound";
        healthy = false;
      } else {
        await db.prepare("SELECT 1").first();
        checks.d1 = "ok";
      }
    } catch {
      checks.d1 = "error";
      healthy = false;
    }

    // R2
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r2 = e.R2_ASSETS as any;
      if (!r2) {
        checks.r2 = "unbound";
        healthy = false;
      } else {
        await r2.list({ limit: 1 });
        checks.r2 = "ok";
      }
    } catch {
      checks.r2 = "error";
      healthy = false;
    }
  } catch {
    checks.env = "no-context";
    healthy = false;
  }

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks, time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
