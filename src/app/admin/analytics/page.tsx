import Link from "next/link";
import { repo } from "@/lib/store";
import { getAllStats } from "@/lib/analytics";
import { CATEGORY_LABEL } from "@/lib/schemas";

export const metadata = { title: "アナリティクス" };

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

export default async function AdminAnalyticsPage() {
  const [props, stats] = await Promise.all([repo.list(), getAllStats()]);
  const titleOf = new Map(props.map((p) => [p.id, p]));

  const rows = Object.entries(stats)
    .map(([id, s]) => {
      const p = titleOf.get(id);
      const topRef =
        Object.entries(s.referrers).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      return {
        id,
        title: p?.title || "（削除済み物件）",
        category: p?.category,
        views: s.views,
        opens: s.opens,
        conv: s.views > 0 ? Math.round((s.opens / s.views) * 100) : 0,
        topRef,
        lastAt: s.lastAt,
      };
    })
    .sort((a, b) => b.views - a.views);

  const totalViews = rows.reduce((n, r) => n + r.views, 0);
  const totalOpens = rows.reduce((n, r) => n + r.opens, 0);
  const overallConv =
    totalViews > 0 ? Math.round((totalOpens / totalViews) * 100) : 0;

  // Merge referrers across all properties
  const refAgg: Record<string, number> = {};
  for (const s of Object.values(stats)) {
    for (const [k, v] of Object.entries(s.referrers)) {
      refAgg[k] = (refAgg[k] ?? 0) + v;
    }
  }
  const refRows = Object.entries(refAgg).sort((a, b) => b[1] - a[1]);
  const refMax = refRows[0]?.[1] ?? 1;

  // Merge daily into a 14-day window
  const days = lastNDays(14);
  const dailyViews = days.map((d) => {
    let v = 0;
    for (const s of Object.values(stats)) v += s.daily[d]?.v ?? 0;
    return { d, v };
  });
  const dailyMax = Math.max(1, ...dailyViews.map((x) => x.v));

  return (
    <div className="p-6 md:p-10">
      <div className="chapter-rule">
        <span className="opacity-60">ADMIN</span>
        <span>アナリティクス — 閲覧と需要傾向</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <span className="opacity-60">{rows.length} スタジオ</span>
      </div>

      {totalViews === 0 ? (
        <p className="text-[13px] text-muted">
          まだ計測データがありません。公開中の物件詳細ページが閲覧されると、ここに集計されます。
        </p>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
            {[
              { label: "総閲覧数", value: totalViews.toLocaleString("ja-JP") },
              { label: "3DGS 起動", value: totalOpens.toLocaleString("ja-JP") },
              { label: "起動率", value: `${overallConv}%` },
              { label: "計測スタジオ", value: rows.length.toString() },
            ].map((c) => (
              <div key={c.label} className="border border-line bg-[#1c1c1c] p-4">
                <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted mb-2">
                  {c.label}
                </div>
                <div className="serif text-3xl text-accent">{c.value}</div>
              </div>
            ))}
          </div>

          {/* Trend — last 14 days */}
          <div className="mb-10">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
              ● 直近 14 日の閲覧推移
            </div>
            <div className="border border-line p-5 flex items-end gap-1.5 h-40">
              {dailyViews.map(({ d, v }) => (
                <div
                  key={d}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                  title={`${d}: ${v} 閲覧`}
                >
                  <div
                    className="w-full bg-accent/70 hover:bg-accent transition"
                    style={{ height: `${(v / dailyMax) * 100}%`, minHeight: v > 0 ? "2px" : "0" }}
                  />
                  <div className="mono text-[8px] text-muted mt-1.5 rotate-0">
                    {d.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_300px] gap-8">
            {/* Per-studio ranking */}
            <div>
              <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
                ● スタジオ別ランキング（閲覧順）
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
                    {rows.map((r, i) => (
                      <tr
                        key={r.id}
                        className={`border-b border-line ${i % 2 === 1 ? "bg-[#1a1a1a]" : ""}`}
                      >
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/properties/${r.id}`}
                            target="_blank"
                            className="hover:text-accent transition"
                          >
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Referrers */}
            <div>
              <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
                ● 流入元（閲覧ベース）
              </div>
              <div className="border border-line p-4 space-y-3">
                {refRows.length === 0 ? (
                  <p className="text-[12px] text-muted">データなし</p>
                ) : (
                  refRows.map(([src, n]) => (
                    <div key={src}>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-ink truncate">{src}</span>
                        <span className="mono text-muted">{n}</span>
                      </div>
                      <div className="h-1.5 bg-[#222]">
                        <div
                          className="h-full bg-accent/70"
                          style={{ width: `${(n / refMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="text-[10px] text-muted leading-[1.7] mt-3">
                契約傾向の読み: 閲覧が多く起動率も高いスタジオ＝強い需要。
                流入元で施策（SNS/検索）の効きを確認。
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
