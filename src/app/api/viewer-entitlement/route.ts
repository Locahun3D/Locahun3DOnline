import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { isStudioPurchaseRestricted } from "@/lib/account-schema";

export const dynamic = "force-dynamic";

/**
 * ビューアーが道具（カメラリセット以外のボタン・レイヤー・URL共有）を出してよいかを返す。
 * 2026-11-10 本人指示「カメラリセット以外のボタン、レイヤー、URL共有機能を課金限定にしたい」。
 * サイトから開いたビューアー（protected=1）は見るだけで始め、ここで full:true が返ったときだけ道具を出す。
 * full: 管理者・撮影スタジオ（自分の物件しか開けない）・無料以外のプラン。ログインしていなければ false。
 */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const full = !!user && (user.role === "admin" || isStudioPurchaseRestricted(user.role) || (user.plan ?? "free") !== "free");
  return NextResponse.json({ full }, { headers: { "Cache-Control": "no-store, private" } });
}
