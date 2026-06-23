import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { repo as propertyRepo } from "@/lib/store";
import { DATA_LICENSE_LABEL, DATA_LICENSE_DESC } from "@/lib/schemas";
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

  const property = await propertyRepo.get(purchase.propertyId);
  const license = property?.splatItems[purchase.splatItemIndex]?.license ?? "standard";

  const html = generateReceiptHtml({
    ...purchase,
    licenseLabel: DATA_LICENSE_LABEL[license],
    licenseDesc: DATA_LICENSE_DESC[license],
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
