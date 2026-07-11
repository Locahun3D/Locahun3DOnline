import Link from "next/link";
import { repo } from "@/lib/store";
import { getAllStats, DEVICE_LABEL, classifyReferrer, type DeviceKind } from "@/lib/analytics";
import { listRecentEvents } from "@/lib/analytics-events";
import { purchaseRepo } from "@/lib/purchases";
import { CATEGORY_LABEL } from "@/lib/schemas";

const EVENT_TYPE_LABEL: Record<string, string> = {
  view: "閲覧",
  viewer_open: "3DGS起動",
};

export const metadata = { title: "アナリティクス" };

const PERIODS = [7, 14, 30, 90] as const;
type Period = (typeof PERIODS)[number];

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function fmtPrice(n: number) {
  return `¥${n.toLocaleString()}`;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; q?: string; studio?: string }>;
}) {
  const sp = await searchParams;
  const days: Period =
    PERIODS.find((p) => String(p) === sp.days) ?? 14;
  const query = (sp.q ?? "").trim().toLowerCase();
  const studioFilter = sp.studio ?? "";

  const [props, stats, allPurchases, recentEvents] = await Promise.all([
    repo.list(),
    getAllStats(),
    purchaseRepo.list(),
    listRecentEvents({ propertyId: studioFilter || undefined, limit: 100 }),
  ]);
  const titleOf = new Map(props.map((p) => [p.id, p]));
  const window = lastNDays(days);
  const windowSet = new Set(window);

  // Per-studio rows scoped to the selected period (from daily buckets).
  let rows = Object.entries(stats)
    .map(([id, s]) => {
      let pv = 0;
      let po = 0;
      let pp = 0;
      let pr = 0;
      let prev = 0;
      for (const [d, x] of Object.entries(s.daily)) {
        if (windowSet.has(d)) {
          pv += x.v;
          po += x.o;
          pp += x.p ?? 0;
          pr += x.r ?? 0;
          prev += x.rev ?? 0;
        }
      }
      const p = titleOf.get(id);
      const topRef =
        Object.entries(s.referrers).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      return {
        id,
        // 削除（リストに存在しない）・アーカイブ済み物件はランキングから除外する。
        exists: !!p && p.status !== "archived",
        title: p?.title || id,
        category: p?.category,
        views: pv,
        opens: po,
        purchases: pp,
        refunds: pr,
        revenue: prev,
        conv: pv > 0 ? Math.round((po / pv) * 100) : 0,
        topRef,
      };
    })
    .filter((r) => r.exists && (r.views > 0 || r.opens > 0 || r.purchases > 0));

  // Apply search filter
  if (query) {
    rows = rows.filter((r) => r.title.toLowerCase().includes(query));
  }
  if (studioFilter) {
    rows = rows.filter((r) => r.id === studioFilter);
  }
  rows.sort((a, b) => b.views - a.views);

  const totalViews = rows.reduce((n, r) => n + r.views, 0);
  const totalOpens = rows.reduce((n, r) => n + r.opens, 0);
  const totalPurchases = rows.reduce((n, r) => n + r.purchases, 0);
  const totalRevenue = rows.reduce((n, r) => n + r.revenue, 0);
  const overallConv =
    totalViews > 0 ? Math.round((totalOpens / totalViews) * 100) : 0;
  const avgPerDay = (totalViews / days).toFixed(1);

  // Purchase-based stats from purchase records
  const completedPurchases = allPurchases.filter((p) => p.status === "completed");
  const refundedPurchases = allPurchases.filter((p) => p.status === "refunded");
  const allTimeRevenue = completedPurchases.reduce((s, p) => s + p.priceYen, 0);
  const allTimeRefunds = refundedPurchases.reduce((s, p) => s + p.priceYen, 0);

  // Daily trend over the window.
  const dailyViews = window.map((d) => {
    let v = 0;
    let p = 0;
    for (const s of Object.values(stats)) {
      v += s.daily[d]?.v ?? 0;
      p += s.daily[d]?.p ?? 0;
    }
    return { d, v, p };
  });
  const dailyMax = Math.max(1, ...dailyViews.map((x) => x.v));
  const peak = dailyViews.reduce((m, x) => (x.v > m.v ? x : m), { d: "—", v: 0, p: 0 });

  // Referrers (all-time aggregate).
  const refAgg: Record<string, number> = {};
  for (const s of Object.values(stats)) {
    for (const [k, v] of Object.entries(s.referrers)) {
      refAgg[k] = (refAgg[k] ?? 0) + v;
    }
  }
  const refRows = Object.entries(refAgg).sort((a, b) => b[1] - a[1]);
  const refMax = refRows[0]?.[1] ?? 1;

  // Devices (all-time aggregate).
  const devAgg: Record<string, number> = {};
  for (const s of Object.values(stats)) {
    for (const [k, v] of Object.entries(s.devices ?? {})) {
      devAgg[k] = (devAgg[k] ?? 0) + v;
    }
  }
  const devTotal = Object.values(devAgg).reduce((n, v) => n + v, 0);
  const devOrder: DeviceKind[] = ["desktop", "mobile", "tablet"];

  const hasAnyData = Object.keys(stats).length > 0;

  // All studios for filter dropdown（削除・アーカイブ物件は除外）
  const allStudios = Object.entries(stats)
    .map(([id]) => titleOf.get(id))
    .filter((p) => p && p.status !== "archived")
    .map((p) => ({ id: p!.id, title: p!.title || p!.id }));

  return (
    <div className="p-6 md:p-10">
      <div className="chapter-rule">
        <span className="opacity-60">ADMIN</span>
        <span>アナリティクス — 閲覧・購入・需要傾向</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <span className="opacity-60">{rows.length} スタジオ</span>
      </div>

      {/* Period selector + search */}
      <div className="flex flex-wrap items-center gap-2 mb-4 mono text-[10px] tracking-[0.22em] uppercase">
        <span className="text-muted mr-1">期間</span>
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/admin/analytics?days=${p}${query ? `&q=${encodeURIComponent(query)}` : ""}${studioFilter ? `&studio=${studioFilter}` : ""}`}
            className={`px-3 py-1.5 border transition ${
              days === p
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {p}日
          </Link>
        ))}
      </div>

      {/* Search + studio filter */}
      <form className="flex flex-wrap items-center gap-3 mb-8">
        <input type="hidden" name="days" value={days} />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="スタジオ名で検索…"
          className="bg-neutral-300 text-black border border-line px-3 py-2 text-[13px] w-full sm:w-56 focus:outline-none focus:border-accent placeholder:text-black/40"
        />
        <select
          name="studio"
          defaultValue={studioFilter}
          className="bg-bg border border-line text-[12px] px-2 py-2 text-ink"
        >
          <option value="">全スタジオ</option>
          {allStudios.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <button
          type="submit"
          className="mono text-[10px] tracking-[0.18em] uppercase border border-line px-3 py-2 text-muted hover:text-accent hover:border-accent transition"
        >
          絞込
        </button>
        {(query || studioFilter) && (
          <Link
            href={`/admin/analytics?days=${days}`}
            className="mono text-[10px] tracking-[0.18em] uppercase text-muted hover:text-ink transition"
          >
            リセット
          </Link>
        )}
      </form>

      {!hasAnyData ? (
        <p className="text-[13px] text-muted">
          まだ計測データがありません。公開中の物件詳細ページが閲覧されると、ここに集計されます。
        </p>
      ) : (
        <>
          {/* Summary (period-scoped) */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-10">
            {[
              { label: `閲覧数（${days}日）`, value: totalViews.toLocaleString("ja-JP"), color: "" },
              { label: "3DGS 起動", value: totalOpens.toLocaleString("ja-JP"), color: "" },
              { label: "起動率", value: `${overallConv}%`, color: "" },
              { label: "1日平均", value: avgPerDay, color: "" },
              { label: `購入（${days}日）`, value: String(totalPurchases), color: "text-green-400" },
              { label: `売上（${days}日）`, value: fmtPrice(totalRevenue), color: "text-accent" },
            ].map((c) => (
              <div key={c.label} className="border border-line bg-[#1c1c1c] p-4">
                <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted mb-2">
                  {c.label}
                </div>
                <div className={`serif text-2xl ${c.color || "text-accent"}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* All-time purchase summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
            {[
              { label: "累計購入件数", value: String(completedPurchases.length) },
              { label: "累計売上", value: fmtPrice(allTimeRevenue) },
              { label: "返金件数", value: String(refundedPurchases.length) },
              { label: "返金総額", value: fmtPrice(allTimeRefunds) },
            ].map((c) => (
              <div key={c.label} className="border border-line bg-[#1a1a1a] p-3">
                <div className="mono text-[9px] tracking-[0.24em] uppercase text-muted mb-1">
                  {c.label}
                </div>
                <div className="serif text-lg text-ink">{c.value}</div>
              </div>
            ))}
          </div>

          {/* Trend */}
          <div className="mb-10">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
              ● 直近 {days} 日の閲覧推移{peak.v > 0 ? `（ピーク ${peak.d.slice(5)} / ${peak.v}）` : ""}
            </div>
            <div className="border border-line p-5 flex items-end gap-1 h-40 overflow-x-auto">
              {dailyViews.map(({ d, v, p }) => (
                <div
                  key={d}
                  className="flex-1 min-w-[6px] flex flex-col items-center justify-end h-full"
                  title={`${d}: ${v} 閲覧${p > 0 ? ` / ${p} 購入` : ""}`}
                >
                  {p > 0 && (
                    <div
                      className="w-full bg-green-500/70"
                      style={{ height: `${(p / dailyMax) * 100}%`, minHeight: "3px" }}
                    />
                  )}
                  <div
                    className="w-full bg-accent/70 hover:bg-accent transition"
                    style={{ height: `${(v / dailyMax) * 100}%`, minHeight: v > 0 ? "2px" : "0" }}
                  />
                  {days <= 30 && (
                    <div className="mono text-[8px] text-muted mt-1.5">{d.slice(5)}</div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-2 mono text-[9px] text-muted">
              <span className="flex items-center gap-1"><span className="w-3 h-2 bg-accent/70 inline-block" /> 閲覧</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-500/70 inline-block" /> 購入</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_300px] gap-8">
            {/* Ranking (period-scoped) */}
            <div>
              <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
                ● スタジオ別ランキング（{days}日・閲覧順）
              </div>
              <div className="border border-line overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#222] border-b border-line mono text-[10px] tracking-[0.18em] uppercase text-muted">
                      <th className="text-left px-3 py-2.5 font-normal min-w-[180px]">スタジオ</th>
                      <th className="text-right px-3 py-2.5 font-normal">閲覧</th>
                      <th className="text-right px-3 py-2.5 font-normal">起動</th>
                      <th className="text-right px-3 py-2.5 font-normal">起動率</th>
                      <th className="text-right px-3 py-2.5 font-normal">購入</th>
                      <th className="text-right px-3 py-2.5 font-normal">売上</th>
                      <th className="text-left px-3 py-2.5 font-normal">主な流入</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">この期間のデータはありません。</td></tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr key={r.id} className={`border-b border-line ${i % 2 === 1 ? "bg-[#1a1a1a]" : ""}`}>
                          <td className="px-3 py-2.5">
                            <Link href={`/admin/analytics?days=${days}&studio=${r.id}`} className="hover:text-accent transition">
                              {r.title}
                            </Link>
                            <span className="mono text-[9px] text-muted ml-2">
                              {r.category ? CATEGORY_LABEL[r.category] : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-ink">{r.views}</td>
                          <td className="px-3 py-2.5 text-right text-accent">{r.opens}</td>
                          <td className="px-3 py-2.5 text-right text-muted">{r.conv}%</td>
                          <td className="px-3 py-2.5 text-right text-green-400">{r.purchases || "—"}</td>
                          <td className="px-3 py-2.5 text-right mono text-[11px]">{r.revenue > 0 ? fmtPrice(r.revenue) : "—"}</td>
                          <td className="px-3 py-2.5 text-muted">{r.topRef}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-8">
              {/* Devices */}
              <div>
                <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
                  ● 端末別（全期間）
                </div>
                <div className="border border-line p-4 space-y-3">
                  {devTotal === 0 ? (
                    <p className="text-[12px] text-muted">データなし</p>
                  ) : (
                    devOrder
                      .filter((k) => (devAgg[k] ?? 0) > 0)
                      .map((k) => {
                        const n = devAgg[k] ?? 0;
                        const pct = Math.round((n / devTotal) * 100);
                        return (
                          <div key={k}>
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-ink">{DEVICE_LABEL[k]}</span>
                              <span className="mono text-muted">{n}（{pct}%）</span>
                            </div>
                            <div className="h-1.5 bg-[#222]">
                              <div className="h-full bg-accent/70" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Referrers */}
              <div>
                <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
                  ● 流入元（全期間・閲覧ベース）
                </div>
                <div className="border border-line p-4 space-y-3">
                  {refRows.length === 0 ? (
                    <p className="text-[12px] text-muted">データなし</p>
                  ) : (
                    refRows.slice(0, 8).map(([src, n]) => (
                      <div key={src}>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-ink truncate">{src}</span>
                          <span className="mono text-muted">{n}</span>
                        </div>
                        <div className="h-1.5 bg-[#222]">
                          <div className="h-full bg-accent/70" style={{ width: `${(n / refMax) * 100}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 最近の閲覧者（個別イベントログ・サインイン済みのみ本人特定） */}
          <div className="mt-10">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
              ● 最近の閲覧者{studioFilter ? "（絞込中）" : ""}（直近{recentEvents.length}件）
            </div>
            <div className="border border-line overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[#222] border-b border-line mono text-[10px] tracking-[0.18em] uppercase text-muted">
                    <th className="text-left px-3 py-2.5 font-normal min-w-[130px]">日時</th>
                    <th className="text-left px-3 py-2.5 font-normal min-w-[160px]">物件</th>
                    <th className="text-left px-3 py-2.5 font-normal">種別</th>
                    <th className="text-left px-3 py-2.5 font-normal min-w-[180px]">誰が</th>
                    <th className="text-left px-3 py-2.5 font-normal">端末</th>
                    <th className="text-left px-3 py-2.5 font-normal">流入元</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">まだイベントがありません。</td></tr>
                  ) : (
                    recentEvents.map((e, i) => (
                      <tr key={e.id} className={`border-b border-line ${i % 2 === 1 ? "bg-[#1a1a1a]" : ""}`}>
                        <td className="px-3 py-2.5 mono text-[11px] text-muted">
                          {e.createdAt.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/admin/analytics?days=${days}&studio=${e.propertyId}`} className="hover:text-accent transition">
                            {titleOf.get(e.propertyId)?.title || e.propertyId}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-muted">{EVENT_TYPE_LABEL[e.type] ?? e.type}</td>
                        <td className="px-3 py-2.5">
                          {e.userEmail ? (
                            <span className="text-ink">{e.userEmail}</span>
                          ) : (
                            <span className="text-muted">匿名（未サインイン）</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted">{DEVICE_LABEL[e.device as DeviceKind] ?? e.device}</td>
                        <td className="px-3 py-2.5 text-muted">{classifyReferrer(e.referrer)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mono text-[9px] text-muted mt-2">
              サインイン済みユーザーのみメールアドレスが表示されます。未サインインの閲覧は「匿名」表示のまま個人を特定しません。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
