import Link from "next/link";
import { purchaseRepo } from "@/lib/purchases";
import { repo as propertyRepo } from "@/lib/store";
import { refundPurchaseAction } from "@/lib/admin-actions";

export const metadata = { title: "データ販売" };

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    completed: { bg: "bg-green-900/30", text: "text-green-400", label: "完了" },
    pending: { bg: "bg-yellow-900/30", text: "text-yellow-400", label: "処理中" },
    cancelled: { bg: "bg-red-900/30", text: "text-red-400", label: "キャンセル" },
    refunded: { bg: "bg-purple-900/30", text: "text-purple-400", label: "返金済" },
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

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; property?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim().toLowerCase();
  const filterPropertyId = sp.property ?? "";
  const filterStatus = sp.status ?? "";

  const allPurchases = await purchaseRepo.list();
  const allProps = await propertyRepo.list();
  const saleProps = allProps.filter((p) =>
    p.splatItems.some((item) => item.forSale && item.salePrice > 0),
  );
  const propTitleMap = new Map(allProps.map((p) => [p.id, p.title || p.id]));

  // Filter purchases
  let purchases = allPurchases;
  if (query) {
    purchases = purchases.filter((p) => {
      const hay = `${p.propertyTitle} ${p.userEmail} ${p.itemLabel}`.toLowerCase();
      return hay.includes(query);
    });
  }
  if (filterPropertyId) {
    purchases = purchases.filter((p) => p.propertyId === filterPropertyId);
  }
  if (filterStatus) {
    purchases = purchases.filter((p) => p.status === filterStatus);
  }

  const completedAll = allPurchases.filter((p) => p.status === "completed");
  const refundedAll = allPurchases.filter((p) => p.status === "refunded");
  const totalRevenue = completedAll.reduce((sum, p) => sum + p.priceYen, 0);
  const totalRefunded = refundedAll.reduce((sum, p) => sum + p.priceYen, 0);

  // Per-studio purchase stats
  const studioStats = new Map<string, { count: number; revenue: number; refunds: number }>();
  for (const p of allPurchases) {
    const s = studioStats.get(p.propertyId) ?? { count: 0, revenue: 0, refunds: 0 };
    if (p.status === "completed") { s.count += 1; s.revenue += p.priceYen; }
    if (p.status === "refunded") { s.refunds += 1; }
    studioStats.set(p.propertyId, s);
  }

  // Unique property IDs with purchases (for filter dropdown)
  const purchasedPropertyIds = [...new Set(allPurchases.map((p) => p.propertyId))];

  return (
    <div className="p-6 md:p-10 space-y-8">
      <header className="flex items-baseline gap-4 flex-wrap">
        <h1 className="serif text-2xl tracking-wider">データ販売管理</h1>
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-40">
          {allPurchases.length} purchases
        </span>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
          <div className="text-2xl font-semibold">{completedAll.length}</div>
        </div>
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            総売上
          </div>
          <div className="text-2xl font-semibold text-accent">{fmtPrice(totalRevenue)}</div>
        </div>
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            返金総額
          </div>
          <div className="text-2xl font-semibold text-purple-400">{fmtPrice(totalRefunded)}</div>
        </div>
      </div>

      {/* Per-studio sales breakdown */}
      {studioStats.size > 0 && (
        <section>
          <h2 className="mono text-[11px] tracking-[0.28em] uppercase opacity-60 mb-3">
            スタジオ別売上
          </h2>
          <div className="border border-line overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="mono text-[10px] tracking-[0.2em] uppercase text-left opacity-40 border-b border-line">
                  <th className="px-4 py-3 font-normal">スタジオ</th>
                  <th className="px-4 py-3 font-normal text-right">購入件数</th>
                  <th className="px-4 py-3 font-normal text-right">売上</th>
                  <th className="px-4 py-3 font-normal text-right">返金</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {[...studioStats.entries()]
                  .sort((a, b) => b[1].revenue - a[1].revenue)
                  .map(([propId, s]) => (
                    <tr key={propId} className="hover:bg-[#1a1a1a] transition">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/purchases?property=${propId}`}
                          className="hover:text-accent transition"
                        >
                          {propTitleMap.get(propId) ?? propId}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right mono text-[11px]">{s.count}</td>
                      <td className="px-4 py-3 text-right mono text-[11px] text-accent">{fmtPrice(s.revenue)}</td>
                      <td className="px-4 py-3 text-right mono text-[11px] text-purple-400">{s.refunds > 0 ? `${s.refunds} 件` : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Search + filters */}
      <section>
        <h2 className="mono text-[11px] tracking-[0.28em] uppercase opacity-60 mb-3">
          購入履歴
        </h2>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <form className="contents">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="物件名・メール・ラベルで検索…"
              className="bg-neutral-300 text-black border border-line px-3 py-2 text-[13px] w-full sm:w-64 focus:outline-none focus:border-accent placeholder:text-black/40"
            />
            <select
              name="property"
              defaultValue={filterPropertyId}
              className="bg-bg border border-line text-[12px] px-2 py-2 text-ink"
            >
              <option value="">物件すべて</option>
              {purchasedPropertyIds.map((id) => (
                <option key={id} value={id}>{propTitleMap.get(id) ?? id}</option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={filterStatus}
              className="bg-bg border border-line text-[12px] px-2 py-2 text-ink"
            >
              <option value="">状態すべて</option>
              <option value="completed">完了</option>
              <option value="pending">処理中</option>
              <option value="refunded">返金済</option>
              <option value="cancelled">キャンセル</option>
            </select>
            <button
              type="submit"
              className="mono text-[10px] tracking-[0.18em] uppercase border border-line px-3 py-2 text-muted hover:text-accent hover:border-accent transition"
            >
              検索
            </button>
            {(query || filterPropertyId || filterStatus) && (
              <Link
                href="/admin/purchases"
                className="mono text-[10px] tracking-[0.18em] uppercase text-muted hover:text-ink transition"
              >
                リセット
              </Link>
            )}
          </form>
          <span className="mono text-[11px] text-muted ml-auto">{purchases.length} 件</span>
        </div>

        {purchases.length === 0 ? (
          <p className="text-sm opacity-50">該当する購入はありません。</p>
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
                  <th className="px-4 py-3 font-normal text-center">操作</th>
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
                    <td className="px-4 py-3 text-center">
                      {statusBadge(p.status)}
                      {p.status === "refunded" && p.refundReason && (
                        <div className="mono text-[9px] text-purple-400/60 mt-1 max-w-[120px] truncate" title={p.refundReason}>
                          {p.refundReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.status === "completed" && (
                        <form action={refundPurchaseAction} className="inline-flex items-center gap-1">
                          <input type="hidden" name="id" value={p.id} />
                          <input
                            type="text"
                            name="reason"
                            placeholder="返金理由"
                            className="w-24 bg-bg border border-line text-[10px] px-2 py-1 text-ink"
                          />
                          <button
                            type="submit"
                            className="mono text-[10px] uppercase border border-purple-400/40 text-purple-400/80 px-2 py-1 hover:bg-purple-400 hover:text-bg transition"
                            onClick={(e) => {
                              if (!confirm("この購入を返金しますか？")) e.preventDefault();
                            }}
                          >
                            返金
                          </button>
                        </form>
                      )}
                      {p.status === "refunded" && (
                        <span className="mono text-[9px] opacity-40">
                          {p.refundedAt ? fmtDate(p.refundedAt) : ""}
                        </span>
                      )}
                    </td>
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
