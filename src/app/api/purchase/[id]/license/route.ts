import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { DATA_LICENSE_LABEL, DATA_LICENSE_DESC, type DataLicense } from "@/lib/schemas";
import { generateLicenseText } from "@/lib/license-file";

export const runtime = "nodejs";

/**
 * データダウンロードに添える「利用規約」テキストファイル。ライセンス区分
 * (購入時点のスナップショット)に応じて内容が変わる。receipt route と同じ
 * 認可パターン。ダウンロード画面でデータ本体・領収書と並べて提供する。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id } = await params;
  const purchase = await purchaseRepo.get(id);
  if (!purchase) {
    return NextResponse.json({ error: "購入が見つかりません" }, { status: 404 });
  }
  if (purchase.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "アクセス権がありません" }, { status: 403 });
  }
  if (purchase.status !== "completed") {
    return NextResponse.json({ error: "未完了の購入です" }, { status: 400 });
  }

  // ライセンス区分は購入時点のスナップショット(purchase.license)を使う
  // （receipt route と同じ理由: 物件側で後から区分変更されても購入者の
  //   利用範囲は契約時点のまま固定する）。
  const license = (purchase.license as DataLicense) || "standard";

  const text = generateLicenseText({
    propertyTitle: purchase.propertyTitle,
    itemLabel: purchase.itemLabel,
    licenseLabel: DATA_LICENSE_LABEL[license] ?? DATA_LICENSE_LABEL.standard,
    licenseDesc: DATA_LICENSE_DESC[license] ?? DATA_LICENSE_DESC.standard,
    priceYen: purchase.priceYen,
    createdAt: purchase.createdAt,
    completedAt: purchase.completedAt,
    termsAgreedAt: purchase.termsAgreedAt,
    userEmail: purchase.userEmail,
    purchaseId: purchase.id,
  });

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // 日本語ファイル名は filename* (RFC 5987) で指定する（filename= だけだと文字化けする）。
      "Content-Disposition": `attachment; filename="license.txt"; filename*=UTF-8''${encodeURIComponent(
        `ロケハン3D_利用規約_${purchase.propertyTitle || purchase.propertyId}.txt`,
      )}`,
    },
  });
}
