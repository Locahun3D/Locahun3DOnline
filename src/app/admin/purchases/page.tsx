import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { repo as propertyRepo } from "@/lib/store";
import { refundPurchaseAction, deletePurchaseAction, bulkDeleteTestPurchasesAction } from "@/lib/admin-actions";
import RefundButton from "@/components/admin/refund-button";
import DeletePurchaseButton from "@/components/admin/delete-purchase-button";
import BulkDeleteTestButton from "@/components/admin/bulk-delete-test-button";
import AdminPageHeader, { AdminPageShell, AdminEmpty } from "@/components/admin/admin-page-header";
import StripeSetupPanel from "@/components/admin/stripe-setup-panel";
import { fmtDateTimeJST } from "@/lib/date-format";
import { filterAdminPurchases } from "@/lib/admin-purchase-filters";
import PendingPurchasesToggle from "@/components/admin/pending-purchases-toggle";

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
  return fmtDateTimeJST(iso);
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; property?: string; status?: string; pending?: string }>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const query = (sp.q ?? "").trim().toLowerCase();
  const filterPropertyId = sp.property ?? "";
  const filterStatus = ["", "completed", "refunded", "cancelled"].includes(sp.status ?? "completed") ? sp.status ?? "completed" : "completed";
  const showPending = sp.pending === "1";

  const allPurchases = await purchaseRepo.list();
  const allProps = await propertyRepo.list();
  const saleProps = allProps.filter((p) =>
    p.splatItems.some((item) => item.forSale && item.salePrice > 0),
  );
  const propTitleMap = new Map(allProps.map((p) => [p.id, p.title || p.id]));

  // Filter purchases
  const purchases = filterAdminPurchases(allPurchases, { q: query, property: filterPropertyId, status: filterStatus, showPending });

  const completedAll = allPurchases.filter((p) => p.status === "completed");
  const refundedAll = allPurchases.filter((p) => p.status === "refunded");
  const totalRevenue = completedAll.reduce((sum, p) => sum + p.priceYen, 0);
  const totalRefunded = refundedAll.reduce((sum, p) => sum + p.priceYen, 0);

  // Per-studio purchase stats
  const studioStats = new Map<string, { count: number; revenue: number; refunds: number }>();
  for (const p of allPurchases) {
    if (p.status !== "completed" && p.status !== "refunded") continue;
    const s = studioStats.get(p.propertyId) ?? { count: 0, revenue: 0, refunds: 0 };
    if (p.status === "completed") { s.count += 1; s.revenue += p.priceYen; }
    if (p.status === "refunded") { s.refunds += 1; }
    studioStats.set(p.propertyId, s);
  }

  // Unique property IDs with purchases (for filter dropdown)
  const purchasedPropertyIds = [...new Set(allPurchases.map((p) => p.propertyId))];

  // 削除可能（Stripe紐付きの未返金 completed 以外）= テスト購入の掃除対象。
  const deletableCount = allPurchases.filter(
    (p) => !(p.status === "completed" && p.stripeSessionId),
  ).length;

  return (
    <AdminPageShell className="space-y-5">
      {/* 2026-09-20: 小型ヘッダーへ。決済の接続状態は直下の「決済設定」パネルの見出しに同じ表示があるので、
          見出し横のバッジ（重複）を外した。 */}
      <AdminPageHeader
        title="データ販売"
        count={`全履歴 ${allPurchases.length} 件`}
        actions={
          <form action={bulkDeleteTestPurchasesAction}>
            <BulkDeleteTestButton count={deletableCount} />
          </form>
        }
      />

      <StripeSetupPanel />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-line px-4 py-3 bg-[#141414]">
          <div className="text-[12px] text-muted">
            販売中の物件
          </div>
          <div className="text-2xl font-semibold">{saleProps.length}</div>
        </div>
        <div className="border border-line px-4 py-3 bg-[#141414]">
          <div className="text-[12px] text-muted">
            購入完了件数
          </div>
          <div className="text-2xl font-semibold">{completedAll.length}</div>
        </div>
        <div className="border border-line px-4 py-3 bg-[#141414]">
          <div className="text-[12px] text-muted">
            売上（完了分）
          </div>
          <div className="text-2xl font-semibold text-accent">{fmtPrice(totalRevenue)}</div>
        </div>
        <div className="border border-line px-4 py-3 bg-[#141414]">
          <div className="text-[12px] text-muted">
            返金総額
          </div>
          <div className="text-2xl font-semibold text-purple-400">{fmtPrice(totalRefunded)}</div>
        </div>
      </div>

      {/* Per-studio sales breakdown */}
      {studioStats.size > 0 && (
        <section>
          <h2 className="text-[14px] font-bold mb-2">
            スタジオ別売上
          </h2>
          <div className="border border-line overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm text-ink">
              <thead>
                <tr className="text-[12px] text-left text-muted border-b border-line">
                  <th className="px-3 py-2 font-normal">スタジオ</th>
                  <th className="px-3 py-2 font-normal text-right">購入件数</th>
                  <th className="px-3 py-2 font-normal text-right">売上</th>
                  <th className="px-3 py-2 font-normal text-right">返金</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {[...studioStats.entries()]
                  .sort((a, b) => b[1].revenue - a[1].revenue)
                  .map(([propId, s]) => (
                    <tr key={propId} className="hover:bg-neutral-100 transition">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/purchases?property=${propId}`}
                          className="hover:text-accent transition"
                        >
                          {propTitleMap.get(propId) ?? propId}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right mono text-[11px]">{s.count}</td>
                      <td className="px-3 py-2 text-right mono text-[11px] text-accent">{fmtPrice(s.revenue)}</td>
                      <td className="px-3 py-2 text-right mono text-[11px] text-purple-400">{s.refunds > 0 ? `${s.refunds} 件` : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Search + filters */}
      <section>
        <h2 className="text-[14px] font-bold mb-2">
          購入履歴
        </h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <form className="contents">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="物件名・メール・ラベルで検索…"
              className="min-h-[40px] bg-neutral-300 text-black border border-line px-3 py-2 text-[13px] w-full sm:w-64 focus:outline-none focus:border-accent placeholder:text-black/40"
            />
            <select
              name="property"
              defaultValue={filterPropertyId}
              className="min-h-[40px] bg-bg border border-line text-[13px] px-2 py-2 text-ink"
            >
              <option value="">物件すべて</option>
              {purchasedPropertyIds.map((id) => (
                <option key={id} value={id}>{propTitleMap.get(id) ?? id}</option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={filterStatus}
              className="min-h-[40px] bg-bg border border-line text-[13px] px-2 py-2 text-ink"
            >
              <option value="">状態すべて</option>
              <option value="completed">完了</option>
              <option value="refunded">返金済</option>
              <option value="cancelled">キャンセル</option>
            </select>
            <PendingPurchasesToggle checked={showPending} />
            <button
              type="submit"
              className="min-h-[40px] text-[13px] border border-line px-4 text-muted hover:text-accent hover:border-accent transition"
            >
              検索
            </button>
            {(query || filterPropertyId || filterStatus !== "completed" || showPending) && (
              <Link
                href="/admin/purchases"
                className="inline-flex min-h-[40px] items-center text-[13px] text-muted hover:text-ink transition"
              >
                リセット
              </Link>
            )}
          </form>
          <span className="mono text-[11px] text-muted ml-auto">{purchases.length} 件</span>
        </div>

        {purchases.length === 0 ? (
          <AdminEmpty>該当する購入はありません。</AdminEmpty>
        ) : (
          <div className="border border-line overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm text-ink">
              <thead>
                <tr className="text-[12px] text-left text-muted border-b border-line">
                  <th className="px-3 py-2 font-normal">日時</th>
                  <th className="px-3 py-2 font-normal">物件</th>
                  <th className="px-3 py-2 font-normal">購入者</th>
                  <th className="px-3 py-2 font-normal text-right">金額</th>
                  <th className="px-3 py-2 font-normal text-center">状態</th>
                  <th className="px-3 py-2 font-normal text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-100 transition">
                    <td className="px-3 py-2 mono text-[11px] opacity-60 whitespace-nowrap">
                      {fmtDate(p.createdAt)}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[200px]">
                      {p.propertyTitle || p.propertyId}
                      {p.itemLabel && (
                        <span className="ml-2 mono text-[9px] tracking-[0.14em] uppercase border border-line px-1 py-0.5 opacity-50">
                          {p.itemLabel}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 mono text-[11px] opacity-60 truncate max-w-[180px]">
                      {p.userEmail}
                    </td>
                    <td className="px-3 py-2 text-right mono text-[11px] whitespace-nowrap">
                      {fmtPrice(p.priceYen)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {statusBadge(p.status)}
                      {p.status === "refunded" && p.refundReason && (
                        <div className="mono text-[9px] text-purple-400/60 mt-1 max-w-[120px] truncate" title={p.refundReason}>
                          {p.refundReason}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex items-center gap-2">
                        {p.status === "completed" && (
                          <form action={refundPurchaseAction} className="inline-flex items-center gap-1">
                            <input type="hidden" name="id" value={p.id} />
                            <input
                              type="text"
                              name="reason"
                              placeholder="返金理由"
                              className="min-h-[40px] w-28 bg-bg border border-line text-[12px] px-2 text-ink"
                            />
                            <RefundButton />
                          </form>
                        )}
                        {p.status === "refunded" && (
                          <span className="mono text-[9px] opacity-40">
                            {p.refundedAt ? fmtDate(p.refundedAt) : ""}
                          </span>
                        )}
                        {/* 削除: 実入金が残り得る (Stripe紐付き completed) 以外は掃除できる。 */}
                        {!(p.status === "completed" && p.stripeSessionId) && (
                          <form action={deletePurchaseAction} className="inline-flex">
                            <input type="hidden" name="id" value={p.id} />
                            <DeletePurchaseButton />
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}
