import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { dataLicenseLabel, dataLicenseDesc, type DataLicense } from "@/lib/schemas";
import { generateReceiptHtml } from "@/lib/receipt";
import { getLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // このAPIは /en/... 経由で叩かれた時のみ x-locale=en になる
  // （呼び出し元リンクを localizedHref() で組む必要がある）。
  const locale = await getLocale();
  const en = locale === "en";

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: en ? "Sign-in required" : "ログインが必要です" }, { status: 401 });
  }

  const { id } = await params;
  const purchase = await purchaseRepo.get(id);
  if (!purchase) {
    return NextResponse.json({ error: en ? "Purchase not found" : "購入が見つかりません" }, { status: 404 });
  }

  if (purchase.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: en ? "You do not have access" : "アクセス権がありません" }, { status: 403 });
  }

  if (purchase.status !== "completed") {
    return NextResponse.json({ error: en ? "This purchase is not yet completed" : "未完了の購入です" }, { status: 400 });
  }

  // ライセンス区分は購入時点のスナップショット（purchase.license）を使う。
  // 物件側の現在の license を見ると、後から管理画面で区分を変更した場合に
  // 購入者が実際に同意した利用範囲と食い違う（利用許諾は契約時点で確定するため）。
  const license = (purchase.license as DataLicense) || "standard";

  const html = generateReceiptHtml({
    ...purchase,
    licenseLabel: dataLicenseLabel(license, locale),
    licenseDesc: dataLicenseDesc(license, locale),
    en,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
