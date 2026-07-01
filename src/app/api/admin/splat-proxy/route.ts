import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R2 公開アクセスは無効化済み（pub-*.r2.dev は401）。絶対URLの外部フェッチ用
// ホワイトリスト。現行データの splatUrl は全て相対（/uploads/… → viewer-stream で
// 認証配信）なのでこの経路は実質未使用。死んだ pub-*.r2.dev は掲載しない。
const ALLOWED_HOSTS = [
  "locahun3d-assets.r2.dev",
];

export async function GET(req: NextRequest) {
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
