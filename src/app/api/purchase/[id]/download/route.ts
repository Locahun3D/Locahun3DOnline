import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo, resolvePurchasedItem } from "@/lib/purchases";
import { repo as propertyRepo } from "@/lib/store";
import { pickDownloadFile } from "@/lib/downloads";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBucket = any;

async function getBucket(): Promise<AnyBucket | null> {
  try {
    const { env } = await getCloudflareContext();
    return (env as Record<string, unknown>).R2_ASSETS ?? null;
  } catch {
    return null;
  }
}

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
  path = path.replace(/^\/+/, "");
  path = path.replace(/^api\/r2\//, "");
  return path || null;
}

/**
 * 購入者本人だけが購入済み3DGSデータをダウンロードできるゲート付き配信。
 * R2バインディングから同一オリジンでストリームし、添付として強制ダウンロードさせる。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format");

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const purchase = await purchaseRepo.get(id);
  if (!purchase) {
    return NextResponse.json({ error: "購入が見つかりません" }, { status: 404 });
  }
  if (purchase.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  if (purchase.status !== "completed") {
    return NextResponse.json({ error: "この購入は完了していません" }, { status: 403 });
  }

  const property = await propertyRepo.get(purchase.propertyId);
  const item = property ? resolvePurchasedItem(property.splatItems, purchase) : null;
  if (!item) {
    return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
  }

  // 形式指定: その形式の個別ファイル。存在しない形式が指定された場合は
  // splatUrl（ビューアー用ファイル）へフォールバックせず明確に404を返す
  // （以前はここが空文字になり下の共通フォールバックに落ちて、購入者が
  //   指定と異なるファイルを気付かずダウンロードしてしまっていた）。
  // 形式なし（一括DL）: バンドルZip(downloadFileUrl)を優先、無ければ先頭形式、
  // それも無ければ splatUrl にフォールバック。
  let sourceUrl: string;
  if (format) {
    sourceUrl = pickDownloadFile(item, format)?.url || "";
    if (!sourceUrl) {
      return NextResponse.json(
        { error: `指定された形式（${format}）のファイルが見つかりません` },
        { status: 404 },
      );
    }
  } else {
    sourceUrl = item.downloadFileUrl || pickDownloadFile(item, null)?.url || item.splatUrl || "";
  }
  const key = toR2Key(sourceUrl);
  if (!key) {
    return NextResponse.json({ error: "ダウンロードファイルが未設定です" }, { status: 404 });
  }

  const bucket = await getBucket();
  if (!bucket) {
    return NextResponse.json({ error: "ストレージが利用できません" }, { status: 503 });
  }

  const obj = await bucket.get(key);
  if (!obj) {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
  }

  const filename = key.split("/").pop() || "locahun3d-data";
  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType || "application/octet-stream",
  );
  if (obj.size) headers.set("Content-Length", String(obj.size));
  headers.set(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(filename)}"`,
  );
  headers.set("Cache-Control", "private, no-store");

  return new NextResponse(obj.body as ReadableStream, { headers });
}
