import { NextResponse } from "next/server";
import { repo as propertyRepo } from "@/lib/store";
import { resolveDownloadFiles } from "@/lib/downloads";
import { getSettings } from "@/lib/site-settings";
import { isDataSaleFree, isDataSaleDisabled } from "@/lib/settings-schema";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";

export const runtime = "nodejs";

interface CartLine {
  propertyId: string;
  splatItemIndex: number;
}

/**
 * カート内アイテムの最新価格・購入可否を返す（決済は行わない照会専用）。
 * カートの価格はブラウザの localStorage に追加時点でスナップショット保存
 * されるため、管理側の価格変更・無料期間の開始/終了・販売停止と表示がズレる
 * ことがあった。/cart マウント時にこれを叩いて `reconcileCart` に渡す。
 * ログイン不要（購入済み判定のみサインイン時に行う）。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rawItems: CartLine[] = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const settings = await getSettings();
  const nowIso = new Date().toISOString();
  const salesDisabled = isDataSaleDisabled(settings.dataSaleFreePeriod, nowIso);
  const salesFree = isDataSaleFree(settings.dataSaleFreePeriod, nowIso);
  const user = await getCurrentUser().catch(() => null);

  const results = await Promise.all(
    rawItems.map(async (line) => {
      const propertyId = String(line.propertyId ?? "");
      const idx = typeof line.splatItemIndex === "number" ? line.splatItemIndex : 0;
      const property = propertyId ? await propertyRepo.get(propertyId) : null;
      const item = property?.splatItems[idx];

      let available =
        !!property && !!item && item.forSale && !salesDisabled &&
        resolveDownloadFiles(item).length > 0;

      if (available && user && item) {
        const already = await purchaseRepo.hasPurchased(user.id, propertyId, item.id, idx);
        if (already) available = false;
      }

      return {
        propertyId,
        splatItemIndex: idx,
        price: available && item ? (salesFree ? 0 : item.salePrice) : 0,
        available,
      };
    }),
  );

  return NextResponse.json({ items: results });
}
