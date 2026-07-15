import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { getUploadMode, createPresignedUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * アセットの「差し替え」（同一ファイル内容の入れ替え）用 presign。
 * 通常の presign(新規アップロード)と違い、既存アセットの r2Key をそのまま
 * 再利用する — url/id/r2Key は一切変わらないため、このアセットURLを参照する
 * 全ての物件フィールドが自動的に新しい中身を指すようになる（差し替え元の
 * オーファンファイルが生まれず、削除漏れも起きない設計）。
 */
export async function POST(req: Request) {
  await requireAdmin();

  let body: { id?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const asset = await assetRepo.get(id);
  if (!asset) return NextResponse.json({ error: "unknown_asset" }, { status: 404 });
  if (!asset.r2Key) {
    return NextResponse.json(
      { error: "no_r2_key", message: "このアセットはローカルアップロードのため差し替えに対応していません。" },
      { status: 400 },
    );
  }

  if ((await getUploadMode()) !== "r2") {
    return NextResponse.json(
      { error: "not_r2_mode", message: "差し替えはR2アップロードモードでのみ利用できます。" },
      { status: 400 },
    );
  }

  const contentType = String(body.contentType ?? asset.contentType ?? "application/octet-stream");
  try {
    const { putUrl } = await createPresignedUpload({ r2Key: asset.r2Key, contentType });
    return NextResponse.json({ putUrl, url: asset.url });
  } catch (e) {
    console.error("[assets/replace-presign]", e);
    return NextResponse.json({ error: "presign_failed" }, { status: 502 });
  }
}
