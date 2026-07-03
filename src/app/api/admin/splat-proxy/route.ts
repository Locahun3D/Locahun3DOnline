import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R2 公開アクセスは無効化済み（pub-*.r2.dev は401）。絶対URLの外部フェッチ用
// ホワイトリスト。現行データの splatUrl は全て相対（/uploads/… → viewer-stream で
// 認証配信）なのでこの経路は実質未使用。死んだ pub-*.r2.dev は掲載しない。
const ALLOWED_HOSTS = [
  "locahun3d-assets.r2.dev",
];

/**
 * このルート自体には認可チェックが無かった（R2側の公開アクセス無効化に
 * 依存する二次防御だけだった）。/api/r2 の3DGS無認証DL穴を塞いだのと同じ
 * クラスの欠陥が将来再発しないよう、/api/viewer-stream と同水準の
 * 認証＋閲覧資格チェックをこの route 自身にも持たせる。
 */
export async function GET(req: NextRequest) {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());
  if (!user && !freeAccess) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const hasAccess = freeAccess || (!!user && (user.role === "admin" || (!!user.plan && user.plan !== "free")));
  if (!hasAccess) {
    return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 });
  }

  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const headers: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  const upstream = await fetch(target, { headers });

  const responseHeaders = new Headers();
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(key);
    if (v) responseHeaders.set(key, v);
  }
  responseHeaders.set("cache-control", "public, max-age=86400, immutable");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
