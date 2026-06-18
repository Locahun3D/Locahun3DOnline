import Link from "next/link";
import { repo } from "@/lib/store";
import { getAllStats, DEVICE_LABEL, type DeviceKind } from "@/lib/analytics";
import { CATEGORY_LABEL } from "@/lib/schemas";

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

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days: Period =
    PERIODS.find((p) => String(p) === sp.days) ?? 14;

  const [props, stats] = await Promise.all([repo.list(), getAllStats()]);
  const titleOf = new Map(props.map((p) => [p.id, p]));
  const window = lastNDays(days);
  const windowSet = new Set(window);

  // Per-studio rows scoped to the selected period (from daily buckets).
  const rows = Object.entries(stats)
    .map(([id, s]) => {
      let pv = 0;
      let po = 0;
      for (const [d, x] of Object.entries(s.daily)) {
        if (windowSet.has(d)) {
          pv += x.v;
          po += x.o;
        }
      }
      const p = titleOf.get(id);
      const topRef =
        Object.entries(s.referrers).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      return {
        id,
        title: p?.title || "（削除済み物件）",
        category: p?.category,
        views: pv,
        opens: po,
        conv: pv > 0 ? Math.round((po / pv) * 100) : 0,
        topRef,
      };
    })
    .filter((r) => r.views > 0 || r.opens > 0)
    .sort((a, b) => b.views - a.views);

  const totalViews = rows.reduce((n, r) => n + r.views, 0);
  const totalOpens = rows.reduce((n, r) => n + r.opens, 0);
  const overallConv =
    totalViews > 0 ? Math.round((totalOpens / totalViews) * 100) : 0;
  const avgPerDay = (totalViews / days).toFixed(1);

  // Daily trend over the window.
  const dailyViews = window.map((d) => {
    let v = 0;
    for (const s of Object.values(stats)) v += s.daily[d]?.v ?? 0;
    return { d, v };
  });
  const dailyMax = Math.max(1, ...dailyViews.map((x) => x.v));
  const peak = dailyViews.reduce((m, x) => (x.v > m.v ? x : m), { d: "—", v: 0 });

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

  return (
    <div className="p-6 md:p-10">
      <div className="chapter-rule">
        <span className="opacity-60">ADMIN</span>
        <span>アナリティクス — 閲覧と需要傾向</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <span className="opacity-60">{rows.length} スタジオ</span>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2 mb-8 mono text-[10px] tracking-[0.22em] uppercase">
        <span className="text-muted mr-1">期間</span>
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/admin/analytics?days=${p}`}
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

      {!hasAnyData ? (
        <p className="text-[13px] text-muted">
          まだ計測データがありません。公開中の物件詳細ページが閲覧されると、ここに集計されます。
        </p>
      ) : (
        <>
          {/* Summary (period-scoped) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
            {[
              { label: `閲覧数（${days}日）`, value: totalViews.toLocaleString("ja-JP") },
              { label: "3DGS 起動", value: totalOpens.toLocaleString("ja-JP") },
              { label: "起動率", value: `${overallConv}%` },
              { label: "1日平均", value: avgPerDay },
              { label: `ピーク日`, value: peak.v > 0 ? `${peak.v}` : "—" },
            ].map((c) => (
              <div key={c.label} className="border border-line bg-[#1c1c1c] p-4">
                <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted mb-2">
                  {c.label}
                </div>
                <div className="serif text-3xl text-accent">{c.value}</div>
              </div>
            ))}
          </div>

          {/* Trend */}
          <div className="mb-10">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
              ● 直近 {days} 日の閲覧推移{peak.v > 0 ? `（ピーク ${peak.d.slice(5)} / ${peak.v}）` : ""}
            </div>
            <div className="border border-line p-5 flex items-end gap-1 h-40 overflow-x-auto">
              {dailyViews.map(({ d, v }) => (
                <div
                  key={d}
                  className="flex-1 min-w-[6px] flex flex-col items-center justify-end h-full"
                  title={`${d}: ${v} 閲覧`}
                >
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
                      <th className="text-left px-3 py-2.5 font-normal">主な流入</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">この期間のデータはありません。</td></tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr key={r.id} className={`border-b border-line ${i % 2 === 1 ? "bg-[#1a1a1a]" : ""}`}>
                          <td className="px-3 py-2.5">
                            <Link href={`/properties/${r.id}`} target="_blank" className="hover:text-accent transition">
                              {r.title}
                            </Link>
                            <span className="mono text-[9px] text-muted ml-2">
                              {r.category ? CATEGORY_LABEL[r.category] : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-ink">{r.views}</td>
                          <td className="px-3 py-2.5 text-right text-accent">{r.opens}</td>
                          <td className="px-3 py-2.5 text-right text-muted">{r.conv}%</td>
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
        </>
      )}
    </div>
  );
}
