import PlanCards from "@/components/pricing/plan-cards";
import { getCurrentUser } from "@/lib/dal";
import { getLocale } from "@/lib/i18n/server";

export const metadata = {
  title: "料金プラン",
  description:
    "ロケハン3D オンラインの料金。Free / Individual / Studio / Team の 4 段 + トークン制 3DGS ウォークスルー。年払で -15%。",
};

// 各セル = [日本語, 英語]。表示時に locale で添字を選ぶ。
type Cell = [string, string];
const COMPARE_ROWS: Array<{
  label: Cell;
  free: Cell;
  individual: Cell;
  studio: Cell;
  team: Cell;
}> = [
  { label: ["物件カタログ閲覧", "Location catalog"], free: ["✓", "✓"], individual: ["✓", "✓"], studio: ["✓", "✓"], team: ["✓", "✓"] },
  { label: ["写真ギャラリー", "Photo gallery"], free: ["✓", "✓"], individual: ["✓", "✓"], studio: ["✓", "✓"], team: ["✓", "✓"] },
  { label: ["地図 + 距離検索", "Map + distance search"], free: ["✓", "✓"], individual: ["✓", "✓"], studio: ["✓", "✓"], team: ["✓", "✓"] },
  { label: ["図面ダウンロード", "Floor-plan downloads"], free: ["—", "—"], individual: ["無制限", "Unlimited"], studio: ["無制限", "Unlimited"], team: ["無制限", "Unlimited"] },
  { label: ["履歴・ブックマーク", "History & bookmarks"], free: ["—", "—"], individual: ["永続", "Permanent"], studio: ["永続+共有", "Permanent + shared"], team: ["永続+共有", "Permanent + shared"] },
  { label: ["3DGS ウォークスルー", "3DGS walkthrough"], free: ["登録時 6 トークン", "6 tokens at signup"], individual: ["月 24 トークン", "24 tokens / mo"], studio: ["月 36 トークン", "36 tokens / mo"], team: ["月 90 トークン", "90 tokens / mo"] },
  { label: ["制限あり / NDA 限定シーンの閲覧", "Restricted / NDA-only scenes"], free: ["—", "—"], individual: ["—", "—"], studio: ["—", "—"], team: ["✓（NDA締結で全て閲覧可）", "✓ (view all with NDA)"] },
  { label: ["ログイン端末数", "Devices signed in"], free: ["—", "—"], individual: ["制限なし", "No limit"], studio: ["5 端末", "5 devices"], team: ["20 端末", "20 devices"] },
  { label: ["見積もり依頼", "Quote requests"], free: ["月 1 件", "1 / mo"], individual: ["無制限", "Unlimited"], studio: ["無制限", "Unlimited"], team: ["無制限", "Unlimited"] },
  { label: ["請求書 自動送付 / 電子帳簿対応", "Invoice auto-send / e-bookkeeping"], free: ["—", "—"], individual: ["✓", "✓"], studio: ["✓", "✓"], team: ["✓ 一括", "✓ batch"] },
  { label: ["年払 -15% 適用", "Annual −15%"], free: ["—", "—"], individual: ["✓", "✓"], studio: ["✓", "✓"], team: ["✓", "✓"] },
];

export default async function PricingPage() {
  const user = await getCurrentUser();
  const locale = await getLocale();
  const en = locale === "en";
  const c = (cell: Cell) => cell[en ? 1 : 0];

  return (
    <div className="theme-online frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">PRICING</span>
        <span>Plans</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="text-center mb-12">
        <h1 className="serif text-[clamp(2rem,4vw,3.6rem)] font-bold leading-[1.3] max-w-[26ch] mx-auto">
          {en ? (
            <>
              Every site visit,
              <br />
              <em className="not-italic text-accent">one subscription</em>.
            </>
          ) : (
            <>
              下見の往復を、
              <br />
              <em className="not-italic text-accent">サブスク</em> 一枚に。
            </>
          )}
        </h1>
        <p className="mt-6 text-[14px] text-muted max-w-[58ch] mx-auto leading-[1.85]">
          {en ? (
            <>
              3DGS walkthroughs run on{" "}
              <em className="not-italic text-accent">tokens</em>. Token cost scales
              with studio size, and you can view as many as you like within your
              monthly budget. Annual billing saves 15% — Studio is the best-balanced
              choice.
            </>
          ) : (
            <>
              3DGS ウォークスルーは <em className="not-italic text-accent">トークン制</em>。
              スタジオの規模に応じてトークン消費が変わり、月の予算内で何件でも見られます。
              年払いで -15%、Studio が最もバランス良い選択肢です。
            </>
          )}
        </p>
      </header>

      {/* 4 plans + billing mode toggle */}
      <PlanCards signedIn={!!user} currentPlan={user?.plan} />
      <p className="text-center text-[11px] text-muted mt-5 leading-[1.7]">
        {en ? (
          <>
            Every paid plan{" "}
            <strong className="text-ink">auto-sends a monthly invoice</strong>{" "}
            (compliant with Japan&apos;s e-bookkeeping & invoice systems). Your
            registration (T) number can be entered at signup and is applied to
            invoices automatically.
          </>
        ) : (
          <>
            すべての有料プランは、毎月の<strong className="text-ink">請求書を自動送付</strong>
            （電子帳簿保存法・インボイス制度対応）。登録番号(T番号)は申込時に入力でき、請求書へ自動反映されます。
          </>
        )}
      </p>
      {user && (
        <p className="text-center mono text-[10px] text-muted mt-4 tracking-[0.1em]">
          {en
            ? "※ Payment integration is in progress. Plan changes apply instantly for now."
            : "※ 決済連携は準備中です。現在はプラン変更が即時反映されます。"}
        </p>
      )}

      {/* Comparison table */}
      <section className="mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">COMPARE</span>
          <span>Feature matrix</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>

        <p className="md:hidden mono text-[10px] tracking-[0.2em] uppercase text-muted mb-2 text-right">
          {en ? "← scroll →" : "← 横にスクロール →"}
        </p>
        <div className="border border-line overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12px] mono">
            <thead>
              <tr className="bg-[#222] border-b border-line">
                <th className="text-left px-3 py-3 mono text-[10px] tracking-[0.24em] uppercase opacity-60 font-normal min-w-[160px]">
                  {en ? "Feature" : "機能"}
                </th>
                <th className="px-3 py-3 mono text-[10px] tracking-[0.22em] uppercase font-normal">
                  Free
                </th>
                <th className="px-3 py-3 mono text-[10px] tracking-[0.22em] uppercase font-normal">
                  Individual
                </th>
                <th className="px-3 py-3 mono text-[10px] tracking-[0.22em] uppercase text-accent font-normal">
                  Studio
                </th>
                <th className="px-3 py-3 mono text-[10px] tracking-[0.22em] uppercase font-normal">
                  Team
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, i) => (
                <tr
                  key={row.label[0]}
                  className={`border-b border-line ${i % 2 === 1 ? "bg-[#1c1c1c]" : ""}`}
                >
                  <td className="px-3 py-2.5 text-left text-ink/90">{c(row.label)}</td>
                  <td className="px-3 py-2.5 text-center text-muted">{c(row.free)}</td>
                  <td className="px-3 py-2.5 text-center text-muted">{c(row.individual)}</td>
                  <td className="px-3 py-2.5 text-center text-accent">{c(row.studio)}</td>
                  <td className="px-3 py-2.5 text-center">{c(row.team)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer notes */}
      <div className="mt-16 grid md:grid-cols-3 gap-6 text-[12px] text-muted">
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            {en ? "Token expiry" : "トークンの有効期限"}
          </div>
          <p>
            {en
              ? "Tokens expire 1 year after they are granted, resetting oldest-first. Unlocking a scene costs tokens once — you can revisit that exact scene free for 2 years afterward. Multi-scene locations (e.g. a studio with 4 rooms) charge each scene independently."
              : "トークンは付与（追加）から 1 年で有効期限。期限が来たものから順にリセット（失効）します。シーンのアンロックにトークンを消費するのは初回のみで、その後 2 年間は同じシーンを無償で再視聴できます。1 物件に複数シーンがある場合（例: 4 部屋あるスタジオ）は、シーンごとに個別に消費されます。"}
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            {en ? "Payment / upgrades" : "支払 / アップグレード"}
          </div>
          <p>
            {en
              ? "Credit card (Stripe). Team supports invoice billing. Individual ↔ Studio ↔ Team switch in one click, prorated by the day."
              : "クレジットカード (Stripe)。Team は請求書払い対応。Individual ↔ Studio ↔ Team はワンクリック切替、差額は日割り。"}
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            {en ? "For studio operators" : "スタジオ運営者向け"}
          </div>
          <p>
            {en ? (
              <>
                To list your own studio,{" "}
                <a href="https://web.locahun3d.com/locahun3d_contact.html" className="text-accent hover:underline">
                  get in touch
                </a>
                . Listing uses a separate pricing scheme, with revenue share on data
                sales.
              </>
            ) : (
              <>
                自スタジオを掲載したい方は{" "}
                <a href="https://web.locahun3d.com/locahun3d_contact.html" className="text-accent hover:underline">
                  お問い合わせ
                </a>{" "}
                から。掲載側は別料金体系、データ販売の収益シェアも発生します。
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
