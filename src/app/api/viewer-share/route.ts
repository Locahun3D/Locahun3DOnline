import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { canShareViewerLink, isStudioPurchaseRestricted } from "@/lib/account-schema";
import { ownsProperty } from "@/lib/listing-funnel";
import { toR2Key } from "@/lib/asset-keys";
import { viewUnlockRepo } from "@/lib/view-unlocks";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";
import { viewerShareRepo } from "@/lib/viewer-shares";

/**
 * ビューアーの共有URLを発行する（2026-09-20 本人指示: 最上位プラン＝Team の機能）。
 * body: { src } … ビューアーが今開いているデータのURL（署名付きR2 URL か /api/r2・/api/viewer-stream のパス）。
 * - ログイン必須。Team プラン（または管理者）以外は 403 plan_required。
 * - src が物件の splatItem に一致しなければ 404（任意キーの共有は作らせない）。
 * - 制限付き／NDA 限定のシーンは共有不可。発行者自身が視聴できる状態（アンロック済み等）であること。
 */
function keyFromSrc(src: string): string | null {
  let key = toR2Key(src);
  if (!key) return null;
  key = key.replace(/^api\/viewer-stream\//, "");
  const bucket = process.env.R2_BUCKET || "locahun3d-assets";
  if (key.startsWith(bucket + "/")) key = key.slice(bucket.length + 1); // 署名URLは /<bucket>/<key> のパス形式
  try {
    key = decodeURIComponent(key);
  } catch {
    /* そのまま使う */
  }
  return key || null;
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
    if (!canShareViewerLink(user)) return NextResponse.json({ error: "plan_required" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as { src?: unknown } | null;
    const key = typeof body?.src === "string" ? keyFromSrc(body.src.slice(0, 4000)) : null;
    if (!key) return NextResponse.json({ error: "bad_src" }, { status: 400 });

    const props = await propertyRepo.list();
    let found: { propertyId: string; ownerId?: string; itemId: string; index: number; accessLevel?: string } | null = null;
    for (const p of props) {
      const i = p.splatItems.findIndex((it) => it.splatUrl && toR2Key(it.splatUrl) === key);
      if (i >= 0) {
        found = { propertyId: p.id, ownerId: p.ownerId, itemId: p.splatItems[i].id, index: i, accessLevel: p.splatItems[i].accessLevel };
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (found.accessLevel === "restricted" || found.accessLevel === "nda_only") {
      return NextResponse.json({ error: "not_shareable" }, { status: 403 });
    }

    const settings = await getSettings();
    const canView =
      user.role === "admin" ||
      isFreePeriodActive(settings.freePeriod, new Date().toISOString()) ||
      (isStudioPurchaseRestricted(user.role) && ownsProperty(user, { id: found.propertyId, ownerId: found.ownerId })) ||
      (await viewUnlockRepo.hasValidUnlock(user.id, found.propertyId, found.itemId, found.index));
    if (!canView) return NextResponse.json({ error: "not_unlocked" }, { status: 403 });

    const share = await viewerShareRepo.create({
      propertyId: found.propertyId,
      splatItemId: found.itemId,
      assetKey: key,
      createdBy: user.id,
    });
    const origin = new URL(req.url).origin;
    return NextResponse.json(
      { url: `${origin}/share/${share.token}`, expiresAt: share.expiresAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[viewer-share] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
