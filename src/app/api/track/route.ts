import { NextResponse } from "next/server";
import { track, parseDevice } from "@/lib/analytics";
import { logEvent } from "@/lib/analytics-events";
import { repo } from "@/lib/store";
import { getCurrentUser } from "@/lib/dal";
import { jstDayKey } from "@/lib/date-format";

/**
 * Public beacon endpoint. Client components POST a view / viewer-open event
 * here; we validate the property exists, then record it. No auth required to
 * call this (anonymous traffic is the point) — but we still resolve the
 * caller's session server-side (not from the request body, which the client
 * could spoof) so that "誰が見たか" can attribute events to signed-in users
 * without ever trusting client-supplied identity.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      propertyId?: string;
      type?: string;
      referrer?: string;
    };
    const propertyId = String(body.propertyId ?? "").slice(0, 64);
    const type = body.type === "viewer_open" ? "viewer_open" : "view";
    const referrer = String(body.referrer ?? "").slice(0, 500);
    if (!propertyId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const exists = await repo.get(propertyId);
    if (!exists) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
    const day = jstDayKey();
    const device = parseDevice(req.headers.get("user-agent") ?? "");
    const user = await getCurrentUser().catch(() => null);

    // 管理者アカウント自身の閲覧はアナリティクスに含めない（ユーザー要望）。
    // 運営の動作確認アクセスが「誰が/どこから見たか」の集計カウンタと
    // 個別イベントログ双方を汚染しないよう、集計・記録の前でスキップする。
    // view_unlocks（本人の視聴履歴）は別経路なので影響しない。
    if (user?.role === "admin") {
      return NextResponse.json({ ok: true, skipped: "admin" });
    }

    await track(propertyId, type, referrer, day, device);
    // 個別イベントログは集計カウンタとは別経路 — 失敗しても計測自体は止めない。
    await logEvent({
      propertyId,
      type,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      referrer,
      device,
      createdAt: new Date().toISOString(),
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
