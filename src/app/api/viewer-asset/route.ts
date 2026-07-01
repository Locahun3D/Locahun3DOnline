import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { canViewBackyard, canViewNdaOnly } from "@/lib/account-schema";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";
import { presignViewerAsset, presignConfigured } from "@/lib/r2-presign";

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

/**
 * 視聴用3DGSアセットの署名付きGET URLを発行する。
 * - 認証＋閲覧資格（管理者/有料/限定無料期間 ＋ アイテムのアクセスレベル）を判定。
 * - 資格があり、かつ key が「公開中物件の splatItem.splatUrl」に一致する場合のみ署名。
 *   任意キーの署名は拒否（情報漏えい防止）。
 */
export async function GET(req: Request) {
  try {
    const rawKey = new URL(req.url).searchParams.get("key") || "";
    const key = toR2Key(rawKey);
    if (!key) {
      return NextResponse.json({ error: "bad key" }, { status: 400 });
    }
    if (!presignConfigured()) {
      return NextResponse.json({ error: "signing not configured" }, { status: 503 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const props = await propertyRepo.list();
    let matchedItem: (typeof props)[number]["splatItems"][number] | null = null;
    for (const p of props) {
      for (const item of p.splatItems) {
        if (item.splatUrl && toR2Key(item.splatUrl) === key) {
          matchedItem = item;
          break;
        }
      }
      if (matchedItem) break;
    }
    if (!matchedItem) {
      return NextResponse.json({ error: "視聴対象が見つかりません" }, { status: 404 });
    }

    const settings = await getSettings();
    const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());
    const hasViewerAccess =
      user.role === "admin" || (!!user.plan && user.plan !== "free") || freeAccess;
    if (!hasViewerAccess) {
      return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 });
    }

    if (matchedItem.accessLevel === "restricted" && !canViewBackyard(user)) {
      return NextResponse.json({ error: "制限付きデータです" }, { status: 403 });
    }
    if (matchedItem.accessLevel === "nda_only" && !canViewNdaOnly(user)) {
      return NextResponse.json({ error: "NDA限定データです" }, { status: 403 });
    }

    const signed = await presignViewerAsset(key, 3600);
    if (!signed) {
      return NextResponse.json({ error: "署名に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ url: signed }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "internal", detail: msg }, { status: 500 });
  }
}
