import { requireAdmin } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { DATA_SALE_PRICE } from "@/lib/schemas";
import PricingTable, { type PricingRow } from "@/components/admin/pricing-table";

export const metadata = { title: "価格管理" };

function yen(n: number) {
  return `¥${n.toLocaleString()}`;
}

export default async function PricingPage() {
  await requireAdmin();

  const allProps = await propertyRepo.list();

  const rows: PricingRow[] = [];
  for (const p of allProps) {
    const tokenCost = (p.tokenCost ?? 1) as 1 | 2 | 3;
    p.splatItems.forEach((item, idx) => {
      // 販売対象になり得るデータ＝ビューアー用splat or DLファイル or 既に販売中。
      const isCandidate =
        !!item.splatUrl ||
        !!item.downloadFileUrl ||
        (item.downloadFiles?.length ?? 0) > 0 ||
        item.forSale;
      if (!isCandidate) return;
      rows.push({
        propertyId: p.id,
        idx,
        propertyTitle: p.title,
        label: item.label,
        tokenCost,
        recommended: DATA_SALE_PRICE[tokenCost],
        forSale: item.forSale,
        salePrice: item.salePrice,
        sizeMb: item.sizeMb,
        hasDownload:
          !!item.downloadFileUrl || (item.downloadFiles?.length ?? 0) > 0,
      });
    });
  }

  const forSaleRows = rows.filter((r) => r.forSale && r.salePrice > 0);
  const catalogValue = forSaleRows.reduce((s, r) => s + r.salePrice, 0);
  const missingDownload = forSaleRows.filter((r) => !r.hasDownload).length;

  return (
    <div className="p-6 md:p-10 space-y-8">
      <header className="flex items-baseline gap-4 flex-wrap">
        <h1 className="serif text-2xl tracking-wider">価格管理</h1>
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-40">
          {rows.length} items
        </span>
      </header>

      <p className="text-[13px] text-muted max-w-2xl leading-relaxed">
        全物件の3DGSデータの販売価格を横断で確認・編集できます。価格は税込・円。
        「販売」をオンにした項目だけが公開ページ・カートに表示されます。
        規模クラスごとの<strong className="text-ink">推奨価格</strong>（小規模 ¥
        {DATA_SALE_PRICE[1].toLocaleString()} ／ 中規模 ¥
        {DATA_SALE_PRICE[2].toLocaleString()} ／ 大規模 ¥
        {DATA_SALE_PRICE[3].toLocaleString()}）はクリックで入力できます。
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            販売中のデータ
          </div>
          <div className="text-2xl font-semibold">{forSaleRows.length}</div>
        </div>
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            カタログ総額
          </div>
          <div className="text-2xl font-semibold text-accent">
            {yen(catalogValue)}
          </div>
        </div>
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            DLファイル未設定
          </div>
          <div
            className={`text-2xl font-semibold ${missingDownload > 0 ? "text-amber-400" : "opacity-40"}`}
          >
            {missingDownload}
          </div>
        </div>
      </div>

      <PricingTable rows={rows} />
    </div>
  );
}
