import Link from "next/link";
import { purchaseRepo } from "@/lib/purchases";
import { repo as propertyRepo } from "@/lib/store";

export const metadata = { title: "データ販売" };

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    completed: { bg: "bg-green-900/30", text: "text-green-400", label: "完了" },
    pending: { bg: "bg-yellow-900/30", text: "text-yellow-400", label: "処理中" },
    cancelled: { bg: "bg-red-900/30", text: "text-red-400", label: "キャンセル" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-block px-2 py-0.5 mono text-[10px] tracking-[0.16em] uppercase rounded-sm ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function fmtPrice(n: number) {
  return `¥${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export default async function PurchasesPage() {
  const purchases = await purchaseRepo.list();
  const allProps = await propertyRepo.list();
  const saleProps = allProps.filter((p) =>
    p.splatItems.some((item) => item.forSale && item.salePrice > 0),
  );

  const totalRevenue = purchases
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.priceYen, 0);

  return (
    <div className="p-6 md:p-10 space-y-8">
      <header className="flex items-baseline gap-4 flex-wrap">
        <h1 className="serif text-2xl tracking-wider">データ販売管理</h1>
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-40">
          {purchases.length} purchases
        </span>
      </header>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            販売中の物件
          </div>
          <div className="text-2xl font-semibold">{saleProps.length}</div>
        </div>
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            総購入件数
          </div>
          <div className="text-2xl font-semibold">
            {purchases.filter((p) => p.status === "completed").length}
          </div>
        </div>
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            総売上
          </div>
          <div className="text-2xl font-semibold text-accent">{fmtPrice(totalRevenue)}</div>
        </div>
      </div>

      {/* Sale-enabled properties */}
      <section>
        <h2 className="mono text-[11px] tracking-[0.28em] uppercase opacity-60 mb-3">
          販売中の物件一覧
        </h2>
        {saleProps.length === 0 ? (
          <p className="text-sm opacity-50">
            販売設定されている物件はありません。物件エディタの「3DGSデータ」ステップで販売を有効にしてください。
          </p>
        ) : (
          <div className="border border-line divide-y divide-line">
            {saleProps.map((p) => {
              const count = purchases.filter(
                (x) => x.propertyId === p.id && x.status === "completed",
              ).length;
              return (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-[#1a1a1a] transition">
                  <Link
                    href={`/admin/properties/${p.id}/edit`}
                    className="flex-1 min-w-0 truncate hover:text-accent transition text-sm"
                  >
                    {p.title || p.id}
                  </Link>
                  <span className="mono text-[11px] tracking-[0.14em] opacity-60 shrink-0">
                    {fmtPrice(p.splatItems.filter((i) => i.forSale).reduce((s, i) => s + i.salePrice, 0))}
                  </span>
                  <span className="mono text-[10px] tracking-[0.14em] opacity-40 shrink-0">
                    {count} 件購入
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Purchase history */}
      <section>
        <h2 className="mono text-[11px] tracking-[0.28em] uppercase opacity-60 mb-3">
          購入履歴
        </h2>
        {purchases.length === 0 ? (
          <p className="text-sm opacity-50">まだ購入はありません。</p>
        ) : (
          <div className="border border-line overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="mono text-[10px] tracking-[0.2em] uppercase text-left opacity-40 border-b border-line">
                  <th className="px-4 py-3 font-normal">日時</th>
                  <th className="px-4 py-3 font-normal">物件</th>
                  <th className="px-4 py-3 font-normal">購入者</th>
                  <th className="px-4 py-3 font-normal text-right">金額</th>
                  <th className="px-4 py-3 font-normal text-center">状態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-[#1a1a1a] transition">
                    <td className="px-4 py-3 mono text-[11px] opacity-60 whitespace-nowrap">
                      {fmtDate(p.createdAt)}
                    </td>
                    <td className="px-4 py-3 truncate max-w-[200px]">
                      {p.propertyTitle || p.propertyId}
                      {p.itemLabel && (
                        <span className="ml-2 mono text-[9px] tracking-[0.14em] uppercase border border-line px-1 py-0.5 opacity-50">
                          {p.itemLabel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 mono text-[11px] opacity-60 truncate max-w-[180px]">
                      {p.userEmail}
                    </td>
                    <td className="px-4 py-3 text-right mono text-[11px] whitespace-nowrap">
                      {fmtPrice(p.priceYen)}
                    </td>
                    <td className="px-4 py-3 text-center">{statusBadge(p.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
