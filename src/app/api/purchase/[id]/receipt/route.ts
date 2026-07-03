import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { DATA_LICENSE_LABEL, DATA_LICENSE_DESC, type DataLicense } from "@/lib/schemas";
import { generateReceiptHtml } from "@/lib/receipt";

export const runtime = "nodejs";

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

  // ライセンス区分は購入時点のスナップショット（purchase.license）を使う。
  // 物件側の現在の license を見ると、後から管理画面で区分を変更した場合に
  // 購入者が実際に同意した利用範囲と食い違う（利用許諾は契約時点で確定するため）。
  const license = (purchase.license as DataLicense) || "standard";

  const html = generateReceiptHtml({
    ...purchase,
    licenseLabel: DATA_LICENSE_LABEL[license] ?? DATA_LICENSE_LABEL.standard,
    licenseDesc: DATA_LICENSE_DESC[license] ?? DATA_LICENSE_DESC.standard,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
