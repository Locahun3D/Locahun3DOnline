import Link from "next/link";
import PlanCards from "@/components/pricing/plan-cards";
import FreeDemoFunnel from "@/components/pricing/free-demo-funnel";
import RoiCalculator from "@/components/pricing/roi-calculator";
import { getCurrentUser } from "@/lib/dal";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { PLAN_TOKEN_BUDGET, SIGNUP_BONUS_TOKENS } from "@/lib/schemas";

export async function generateMetadata() {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "Pricing & Demo",
        description:
          "Locahun 3D Online pricing. Free / Individual / Studio / Team plans plus token-based 3DGS walkthroughs. Save 20% with annual billing. Walk the demo scene with no sign-up.",
      }
    : {
        title: "料金・デモ",
        description:
          "ロケハン3D オンラインの料金。Free / Individual / Studio / Team の 4 段 + トークン制 3DGS ウォークスルー。年払で -20%。登録不要のデモ体験つき。",
      };
}

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
  { label: ["履歴・ブックマーク", "History & bookmarks"], free: ["—", "—"], individual: ["永続", "Permanent"], studio: ["永続+共有", "Permanent + shared"], team: ["永続+共有", "Permanent + shared"] },
  { label: ["物件掲示板", "Location board"], free: ["閲覧のみ", "View only"], individual: ["閲覧のみ", "View only"], studio: ["書き込み可", "Post & reply"], team: ["書き込み可", "Post & reply"] },
  // 付与数は PLAN_TOKEN_BUDGET / SIGNUP_BONUS_TOKENS から導出する。以前ここは
  // 数値べた書きで、定数側を変更しても料金表が古い数字のまま残る状態だった。
  { label: ["3DGS ウォークスルー", "3DGS walkthrough"], free: [`登録時 ${SIGNUP_BONUS_TOKENS} トークン`, `${SIGNUP_BONUS_TOKENS} tokens at signup`], individual: [`月 ${PLAN_TOKEN_BUDGET.individual} トークン`, `${PLAN_TOKEN_BUDGET.individual} tokens / mo`], studio: [`月 ${PLAN_TOKEN_BUDGET.studio} トークン`, `${PLAN_TOKEN_BUDGET.studio} tokens / mo`], team: [`月 ${PLAN_TOKEN_BUDGET.team} トークン`, `${PLAN_TOKEN_BUDGET.team} tokens / mo`] },
  // ⚠ 以前は「制限あり / NDA 限定シーンの閲覧」だったが、「制限あり」が何の制限か
  //   一瞬迷う（2026-08-01 レビュー）。行の意味は「NDA限定シーンの閲覧」だけなので短縮。
  { label: ["NDA 限定シーンの閲覧", "NDA-only scenes"], free: ["—", "—"], individual: ["—", "—"], studio: ["—", "—"], team: ["✓（NDA締結で全て閲覧可）", "✓ (view all with NDA)"] },
  { label: ["ログイン端末数", "Devices signed in"], free: ["—", "—"], individual: ["3 端末", "3 devices"], studio: ["10 端末", "10 devices"], team: ["30 端末", "30 devices"] },
  { label: ["請求書 自動送付 / 電子帳簿対応", "Invoice auto-send / e-bookkeeping"], free: ["—", "—"], individual: ["✓", "✓"], studio: ["✓", "✓"], team: ["✓ 一括", "✓ batch"] },
  { label: ["年払 -20% 適用", "Annual −20%"], free: ["—", "—"], individual: ["✓", "✓"], studio: ["✓", "✓"], team: ["✓", "✓"] },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const user = await getCurrentUser();
  const locale = await getLocale();
  const en = locale === "en";
  const c = (cell: Cell) => cell[en ? 1 : 0];
  const { checkout } = await searchParams;
  const lh = (href: string) => localizedHref(href, locale);
  const canApplyForProduction = !!user && user.role !== "production" && user.role !== "admin";

  const demoCover = {
    src: "/demo-pcloud.webp",
    alt: en
      ? "Photo blended with raw 3DGS point cloud data on a real street"
      : "実写に3DGSの生ポイントクラウドを重ねた比較画像",
  };

  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">PRICING</span>
        <span>Plans</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      {checkout === "team_role_required" && (
        <div className="mb-8 max-w-2xl mx-auto border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-[13px] text-center">
          <p>
            {en
              ? "Team is only available to “Production” accounts (NDA-signed). Your current account type can't unlock its NDA-only viewing benefit, so we didn't process the subscription."
              : "Team プランは「制作会社（NDA締結）」アカウント限定です。現在のアカウント種別ではNDA限定シーンの閲覧特典を得られないため、お申し込みを処理しませんでした。"}
          </p>
          {canApplyForProduction && (
            <Link
              href={lh("/account/upgrade")}
              className="inline-block mt-2 mono text-[11px] tracking-[0.2em] uppercase text-accent underline hover:no-underline"
            >
              {en ? "Apply for a Production account →" : "制作会社アカウントを申請する →"}
            </Link>
          )}
        </div>
      )}

      {checkout === "studio_not_allowed" && (
        <div className="mb-8 max-w-2xl mx-auto border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-[13px] text-center">
          <p>
            {en
              ? "Studio accounts are for managing your own listing and aren't eligible for viewing subscriptions or token purchases."
              : "撮影スタジオアカウントは自分の物件を管理するための専用アカウントです。閲覧サブスクやトークン購入の対象ではありません。"}
          </p>
        </div>
      )}

      <header className="text-center mb-12">
        <h1 className="serif text-[clamp(1.55rem,4.5vw,3.6rem)] font-bold leading-[1.3] max-w-[26ch] mx-auto">
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
        <p className="mt-4 sm:mt-6 text-[14px] text-muted max-w-[58ch] mx-auto leading-[1.85]">
          {en ? (
            <>
              3DGS walkthroughs run on{" "}
              <em className="not-italic text-accent">tokens</em>. Token cost scales
              with studio size, and you can view as many as you like within your
              monthly budget. Annual billing saves 20% — Studio is the best-balanced
              choice.
            </>
          ) : (
            <>
              {/* 句点ごとに改行（本人指示 2026-08-27）。全端末共通なので素の <br />。 */}
              3DGS ウォークスルーは <em className="not-italic text-accent">トークン制</em>。
              <br />
              スタジオの規模に応じてトークン消費が変わり、月の予算内で何件でも見られます。
              <br />
              年払いで -20%、Studio が最もバランス良い選択肢です。
            </>
          )}
        </p>
      </header>

      {/* Free demo funnel — walk a real scanned property, no sign-up required */}
      <FreeDemoFunnel
        signUpHref={lh("/sign-up")}
        demoCover={demoCover}
        en={en}
        signedIn={!!user}
      />

      {/* 4 plans + billing mode toggle */}
      <PlanCards signedIn={!!user} currentPlan={user?.plan} currentRole={user?.role} />
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
            {/* 句点ごとに改行（本人指示 2026-08-27）。全端末共通なので素の <br />。 */}
            すべての有料プランは、毎月の<strong className="text-ink">請求書を自動送付</strong>
            （電子帳簿保存法・インボイス制度対応）。
            <br />
            登録番号(T番号)は申込時に入力でき、請求書へ自動反映されます。
          </>
        )}
      </p>
      {user && (
        <p className="text-center mono text-[10px] text-muted mt-4 tracking-[0.1em]">
          {en ? (
            "※ Payment integration is in progress. Plan changes apply instantly for now."
          ) : (
            /* 句点ごとに改行（本人指示 2026-08-27）。全端末共通なので素の <br />。 */
            <>
              ※ 決済連携は準備中です。
              <br />
              現在はプラン変更が即時反映されます。
            </>
          )}
        </p>
      )}

      {/* ROI calculator — how much a subscription saves vs. on-site scouting */}
      <RoiCalculator en={en} />

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

      {/* 単発購入（トークンパック 5枚 ¥3,000）のセクションは 2026-08-13 に廃止。
          トークンは月額プランの付与のみで、買い足す導線はサイトのどこにも無い。 */}

      {/* Footer notes */}
      <div className="mt-16 grid md:grid-cols-3 gap-6 text-[12px] text-muted">
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            {en ? "Token expiry" : "トークンの有効期限"}
          </div>
          <p>
            {en ? (
              "Tokens expire 1 year after they are granted, resetting oldest-first. Unlocking a scene costs tokens once — you can revisit that exact scene free for 1 year afterward. Multi-scene locations (e.g. a studio with 4 rooms) charge each scene independently."
            ) : (
              /* 句点ごとに改行（CLAUDE.md 日本語タイポルール）。全端末共通なので素の <br />。 */
              <>
                トークンは付与（追加）から 1 年で有効期限。
                <br />
                期限が来たものから順にリセット（失効）します。
                <br />
                シーンのアンロックにトークンを消費するのは初回のみで、その後 1 年間は同じシーンを無償で再視聴できます。
                <br />1 物件に複数シーンがある場合（例: 4 部屋あるスタジオ）は、シーンごとに個別に消費されます。
              </>
            )}
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            {en ? "Payment / upgrades" : "支払 / アップグレード"}
          </div>
          <p>
            {en ? (
              "Credit card (Stripe). Team supports invoice billing. Individual ↔ Studio ↔ Team switch in one click, prorated by the day."
            ) : (
              /* 句点ごとに改行（CLAUDE.md 日本語タイポルール）。全端末共通なので素の <br />。 */
              <>
                クレジットカード (Stripe)。
                <br />
                Team は請求書払い対応。
                <br />
                Individual ↔ Studio ↔ Team はワンクリック切替、差額は日割り。
              </>
            )}
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
                <Link href={lh("/contact/listing")} className="text-accent hover:underline">
                  get in touch
                </Link>
                . Listing is currently free during our launch campaign.
              </>
            ) : (
              <>
                自スタジオを掲載したい方は{" "}
                <Link href={lh("/contact/listing")} className="text-accent hover:underline">
                  お問い合わせ
                </Link>{" "}
                {/* 句点ごとに改行（CLAUDE.md 日本語タイポルール）。 */}
                から。
                <br />
                現在はキャンペーンにより掲載無料です。
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
