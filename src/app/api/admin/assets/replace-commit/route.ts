import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { getUploadMode, statR2Object } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 差し替えアップロード完了後の確定。commit route と同じ「R2実在確認＋サイズ
 * 一致」ゲートを踏んでから size/contentType/uploadedAt だけを更新する
 * （url/id/r2Key/filename は不変 = 差し替え元を消す必要が無い設計）。
 */
export async function POST(req: Request) {
  await requireAdmin();
  let body: { id?: string; size?: number; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const asset = await assetRepo.get(id);
  if (!asset) return NextResponse.json({ error: "unknown_asset" }, { status: 404 });

  const expectedSize = Number(body.size ?? 0);
  if (asset.r2Key && (await getUploadMode()) === "r2") {
    let stat: { size: number } | null;
    try {
      stat = await statR2Object(asset.r2Key);
    } catch (e) {
      console.error("[assets/replace-commit] R2 verify failed:", e);
      return NextResponse.json(
        { error: "verify_failed", message: "ストレージの確認に失敗しました。時間をおいて再度お試しください。" },
        { status: 502 },
      );
    }
    if (!stat) {
      return NextResponse.json(
        { error: "object_missing", message: "差し替えファイルがストレージに存在しません。もう一度アップロードしてください。" },
        { status: 409 },
      );
    }
    if (expectedSize > 0 && stat.size !== expectedSize) {
      return NextResponse.json(
        {
          error: "size_mismatch",
          message: `アップロードが途中で終わっています（期待 ${expectedSize} バイト / 実際 ${stat.size} バイト）。もう一度アップロードしてください。`,
        },
        { status: 409 },
      );
    }
  }

  const updated = await assetRepo.upsert({
    ...asset,
    size: expectedSize || asset.size,
    contentType: String(body.contentType ?? asset.contentType),
    uploadedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, asset: updated });
}
