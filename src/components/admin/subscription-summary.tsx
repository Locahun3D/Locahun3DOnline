/**
 * サブスク売上サマリー（管理画面専用・サーバーコンポーネント）。
 *
 * 元は /admin/subscriptions のページ本体だったものを、アナリティクスの
 * 「サブスクリプション」タブからも同じ内容を出せるように切り出した
 * （運用担当から「サブスク売上まで潜るのが面倒」との指摘のため）。
 * 数値の定義・注意書きは1箇所に集約し、2画面で食い違わないようにする。
 */
import { userRepo } from "@/lib/users";
import { PLAN_LIST_PRICE_JPY } from "@/lib/schemas";
import { ACCOUNT_PLANS, type AccountPlan } from "@/lib/account-schema";
import { stripeConfigStatus } from "@/lib/stripe";
import { jstDayKey } from "@/lib/date-format";

const PLAN_LABEL: Record<AccountPlan, string> = {
  free: "Free",
  individual: "Individual",
  studio: "Studio",
  team: "Team",
};

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString()}`;
}

export default async function SubscriptionSummary({
  heading = "サブスク売上",
}: {
  /** 見出し文字列。アナリティクスのタブ内では文脈が違うので差し替えられる。 */
  heading?: string;
}) {
  const users = await userRepo.list();
  // 内部の管理者アカウントは有料会員数・MRRの見込みから除外する（実収益ではない）。
  const active = users.filter((u) => u.status === "active" && u.role !== "admin");
  const paid = active.filter((u) => u.plan !== "free");

  const byPlan = new Map<AccountPlan, number>();
  for (const plan of ACCOUNT_PLANS) byPlan.set(plan, 0);
  for (const u of active) byPlan.set(u.plan, (byPlan.get(u.plan) ?? 0) + 1);

  const rows = ACCOUNT_PLANS.filter((p) => p !== "free").map((plan) => {
    const count = byPlan.get(plan) ?? 0;
    const listPrice = PLAN_LIST_PRICE_JPY[plan];
    return { plan, count, listPrice, mrr: count * listPrice };
  });

  const totalMrr = rows.reduce((s, r) => s + r.mrr, 0);
  const totalArr = totalMrr * 12;
  const freeCount = byPlan.get("free") ?? 0;

  // 直近6ヶ月の新規有料登録数（JST月バケット）。
  const now = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(jstDayKey(d).slice(0, 7));
  }
  const monthlyNewPaid = new Map<string, number>(months.map((m) => [m, 0]));
  for (const u of paid) {
    if (!u.createdAt) continue;
    const key = jstDayKey(u.createdAt).slice(0, 7);
    if (monthlyNewPaid.has(key)) {
      monthlyNewPaid.set(key, (monthlyNewPaid.get(key) ?? 0) + 1);
    }
  }
  const maxMonthly = Math.max(1, ...monthlyNewPaid.values());

  const s = stripeConfigStatus();

  return (
    <div className="space-y-8">
      <header className="flex items-baseline gap-4 flex-wrap">
        <h1 className="serif text-2xl tracking-wider">{heading}</h1>
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-40">
          {paid.length} paid accounts
        </span>
        {!s.enabled ? (
          <span
            className="mono text-[10px] tracking-[0.18em] uppercase border border-amber-400/40 text-amber-400 px-2 py-0.5"
            title="STRIPE_SECRET_KEY 未設定。以下は登録プランに基づく見込み額です（実際の請求とは連動していません）。"
          >
            ● Stripe 未接続（見込み額）
          </span>
        ) : (
          <span
            className="mono text-[10px] tracking-[0.18em] uppercase border border-line px-2 py-0.5 opacity-60"
            title="定価ベースの見込みMRR。年払い(-20%)会員がいる場合、Stripe側の実請求額とは差が出ます。"
          >
            ● 定価ベースの見込み額
          </span>
        )}
      </header>

      <p className="text-[13px] text-muted max-w-2xl leading-relaxed">
        有効(active)なアカウントを課金プラン別に集計した、定価ベースの月間経常収益（MRR）の見込みです。
        年払い会員は実際には年払い割引が適用されるため、Stripe側の実請求額とは差が出ます。
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            見込みMRR
          </div>
          <div className="text-2xl font-semibold text-accent">{yen(totalMrr)}</div>
        </div>
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            見込みARR
          </div>
          <div className="text-2xl font-semibold">{yen(totalArr)}</div>
        </div>
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            有料会員
          </div>
          <div className="text-2xl font-semibold">{paid.length}</div>
        </div>
        <div className="border border-line p-5 bg-[#141414]">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
            Free会員
          </div>
          <div className="text-2xl font-semibold opacity-60">{freeCount}</div>
        </div>
      </div>

      {/* Per-plan breakdown */}
      <section>
        <h2 className="mono text-[11px] tracking-[0.28em] uppercase opacity-60 mb-3">
          プラン別内訳
        </h2>
        <div className="border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="mono text-[10px] tracking-[0.2em] uppercase text-left opacity-40 border-b border-line">
                <th className="px-4 py-3 font-normal">プラン</th>
                <th className="px-4 py-3 font-normal text-right">有効会員数</th>
                <th className="px-4 py-3 font-normal text-right">定価(月額)</th>
                <th className="px-4 py-3 font-normal text-right">見込みMRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {rows.map((r) => (
                <tr key={r.plan} className="hover:bg-neutral-100 transition">
                  <td className="px-4 py-3">{PLAN_LABEL[r.plan]}</td>
                  <td className="px-4 py-3 text-right mono text-[11px]">{r.count}</td>
                  <td className="px-4 py-3 text-right mono text-[11px] opacity-60">
                    {yen(r.listPrice)}
                  </td>
                  <td className="px-4 py-3 text-right mono text-[11px] text-accent">
                    {yen(r.mrr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* New paid signups trend */}
      <section>
        <h2 className="mono text-[11px] tracking-[0.28em] uppercase opacity-60 mb-3">
          月別 新規有料登録（直近6ヶ月）
        </h2>
        <div className="border border-line p-5 bg-[#141414] flex items-end gap-3 h-40">
          {months.map((m) => {
            const count = monthlyNewPaid.get(m) ?? 0;
            const h = Math.max(4, Math.round((count / maxMonthly) * 100));
            return (
              <div
                key={m}
                className="flex-1 flex flex-col items-center gap-2 h-full justify-end"
              >
                <div className="mono text-[11px] text-accent">{count}</div>
                <div className="w-full bg-accent/70" style={{ height: `${h}%` }} />
                <div className="mono text-[9px] tracking-[0.1em] opacity-40">
                  {m.slice(5)}月
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
