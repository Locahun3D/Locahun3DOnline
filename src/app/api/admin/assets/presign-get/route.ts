import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { createPresignedGet } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 管理者用: R2 オブジェクトの署名付き GET URL を発行する。
 * プレビューキャプチャの大容量ダウンロードで使用（Worker 経由の
 * /api/r2 ストリームは負荷時に途中切断が実測されたため、R2 直読み）。
 */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim();
  // アセット/アップロード配下のみ許可（内部ストア _assets/ 等は発行しない）
  if (!/^(assets|uploads)\//.test(key) || key.includes("..")) {
    return NextResponse.json({ error: "bad_key" }, { status: 400 });
  }
  try {
    const url = await createPresignedGet(key);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[presign-get]", e);
    return NextResponse.json({ error: "presign_failed" }, { status: 502 });
  }
}
