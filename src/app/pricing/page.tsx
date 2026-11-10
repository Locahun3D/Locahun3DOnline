import Link from "next/link";
import PlanCards from "@/components/pricing/plan-cards";
import FreeDemoFunnel from "@/components/pricing/free-demo-funnel";
import { getCurrentUser } from "@/lib/dal";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { PLAN_TOKEN_BUDGET, SIGNUP_BONUS_TOKENS } from "@/lib/schemas";
import { VIEWING_IS_FREE } from "@/lib/view-pricing";

export async function generateMetadata() {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "Pricing & Demo",
        description:
          VIEWING_IS_FREE
            ? "Locahun 3D Online pricing. Walk every 3DGS scene free once signed in; the Team plan adds measure, layers and share links for production companies. Save 20% with annual billing."
            : "Locahun 3D Online pricing. Free / Individual / Studio / Team plans plus points-based 3DGS walkthroughs. Save 20% with annual billing. Walk the demo scene with no sign-up.",
      }
    : {
        title: "料金・デモ",
        description:
          VIEWING_IS_FREE
            ? "ロケハン3D オンラインの料金。3DGS はログインするだけで無料で歩ける。計測・レイヤー・共有URLは制作会社向けの Team プランで。年払で -20%。"
            : "ロケハン3D オンラインの料金。Free / Individual / Studio / Team の 4 段 + ポイント制 3DGS ウォークスルー。年払で -20%。登録不要のデモ体験つき。",
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
  { label: ["物件カタログ・図面の閲覧", "Location catalog & floor plans"], free: ["✓", "✓"], individual: ["✓", "✓"], studio: ["✓", "✓"], team: ["✓", "✓"] },
  { label: ["ブックマーク", "Bookmarks"], free: ["✓", "✓"], individual: ["✓", "✓"], studio: ["✓＋共有URL", "✓ + share links"], team: ["✓＋共有URL", "✓ + share links"] },
  // 物件掲示板は 2026-09-19 に機能ごと削除したので行も外した。3Dビューの共有URLは Team だけ（2026-09-20）。
  // （2026-10-08 に一度外したが、10-09 本人「消すのはスタジオに渡す埋め込みだけ」で戻した）
  { label: ["3Dビューの共有URL", "Share links for 3D views"], free: ["—", "—"], individual: ["—", "—"], studio: ["—", "—"], team: ["✓（ログイン不要・2週間）", "✓ (no sign-in, 14 days)"] },
  // 付与数は PLAN_TOKEN_BUDGET / SIGNUP_BONUS_TOKENS から導出する。以前ここは
  // 数値べた書きで、定数側を変更しても料金表が古い数字のまま残る状態だった。
  VIEWING_IS_FREE
    ? { label: ["3DGS ウォークスルー", "3DGS walkthrough"], free: ["ログインで見放題", "Unlimited when signed in"], individual: ["見放題", "Unlimited"], studio: ["見放題", "Unlimited"], team: ["見放題", "Unlimited"] }
    : { label: ["3DGS ウォークスルー", "3DGS walkthrough"], free: [`登録時 ${SIGNUP_BONUS_TOKENS} ポイント`, `${SIGNUP_BONUS_TOKENS} points at signup`], individual: [`月 ${PLAN_TOKEN_BUDGET.individual} ポイント`, `${PLAN_TOKEN_BUDGET.individual} points / mo`], studio: [`月 ${PLAN_TOKEN_BUDGET.studio} ポイント`, `${PLAN_TOKEN_BUDGET.studio} points / mo`], team: [`月 ${PLAN_TOKEN_BUDGET.team} ポイント`, `${PLAN_TOKEN_BUDGET.team} points / mo`] },
  // 2026-11-10: ビューアーは Free だと「見るだけ」（カメラリセットと EN のみ）。測定・日照・カメラワーク・レイヤー・AR などのツールは有料プランから
  //   （/api/viewer-entitlement で判定）。スマホはプランに関係なく視点操作だけの画面になる。
  { label: ["3Dビューの操作ツール", "3D viewer tools"], free: ["見るだけ（カメラリセット）", "View only (camera reset)"], individual: ["✓ 測定・日照・カメラワーク・レイヤー など", "✓ Measure, sun, camera paths, layers, etc."], studio: ["✓", "✓"], team: ["✓", "✓"] },
  // ⚠ 以前は「制限あり / NDA 限定シーンの閲覧」だったが、「制限あり」が何の制限か
  //   一瞬迷う（2026-08-01 レビュー）。行の意味は「NDA限定シーンの閲覧」だけなので短縮。
  { label: ["NDA 限定シーンの閲覧", "NDA-only scenes"], free: ["—", "—"], individual: ["—", "—"], studio: ["—", "—"], team: ["✓（制作会社アカウント＋NDA締結）", "✓ (production account + NDA)"] },
  { label: ["ログイン端末数", "Devices signed in"], free: ["制限なし", "No limit"], individual: ["3 端末", "3 devices"], studio: ["10 端末", "10 devices"], team: ["30 端末", "30 devices"] },
  { label: ["適格請求書", "Qualified invoices"], free: ["—", "—"], individual: ["✓", "✓"], studio: ["✓", "✓"], team: ["✓", "✓"] },
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
    <div className="theme-online frame ui-page-shell pb-12 sm:pb-32">

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
              ? "Studio accounts are for managing your own listing and aren't eligible for viewing subscriptions or point purchases."
              : "撮影スタジオアカウントは自分の物件を管理するための専用アカウントです。閲覧サブスクやポイント購入の対象ではありません。"}
          </p>
        </div>
      )}

      <header className="ui-page-header text-center">
        <h1 className="serif ui-page-title">
          {VIEWING_IS_FREE ? (
            en ? (
              <>
                Walk every location
                <br />
                <em className="not-italic text-accent">free</em> — just sign in.
              </>
            ) : (
              <>
                ロケ地は、ログインだけで
                <br />
                <em className="not-italic text-accent">無料</em>で歩ける。
              </>
            )
          ) : en ? (
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
        {VIEWING_IS_FREE && (
          <p className="ui-page-lead mt-4 text-muted">
            {en
              ? "Measure, layers, share links and multi-device use come with the Team plan for production companies."
              : "計測・レイヤー・共有URL・複数端末は、制作会社向けの Team プランで。"}
          </p>
        )}
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
      {/* カード下の適格請求書の注記と ROI 計算機（浮く予算を、30秒で。）は 2026-11-10 本人指示で削除 */}

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
                <th className={`px-3 py-3 mono text-[10px] tracking-[0.22em] uppercase font-normal ${VIEWING_IS_FREE ? "" : "text-accent"}`}>
                  Studio
                </th>
                <th className={`px-3 py-3 mono text-[10px] tracking-[0.22em] uppercase font-normal ${VIEWING_IS_FREE ? "text-accent" : ""}`}>
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
                  <td className={`px-3 py-2.5 text-center ${VIEWING_IS_FREE ? "text-muted" : "text-accent"}`}>{c(row.studio)}</td>
                  <td className={`px-3 py-2.5 text-center ${VIEWING_IS_FREE ? "text-accent" : ""}`}>{c(row.team)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 単発購入（トークンパック 5枚 ¥3,000）のセクションは 2026-08-13 に廃止。
          ポイントは月額プランの付与のみで、買い足す導線はサイトのどこにも無い。 */}

      {/* Footer notes */}
      <div className="mt-16 grid md:grid-cols-2 gap-6 text-[12px] text-muted">
        {!VIEWING_IS_FREE && <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            {en ? "Point expiry" : "ポイントの有効期限"}
          </div>
          <p>
            {en ? (
              "Monthly points are reset at the next monthly grant (no rollover). The signup bonus expires 1 year after it is granted. Unlocking a scene costs points once — you can revisit that exact scene free for 1 year afterward. Multi-scene locations (e.g. a studio with 4 rooms) charge each scene independently."
            ) : (
              /* 句点ごとに改行（CLAUDE.md 日本語タイポルール）。全端末共通なので素の <br />。 */
              <>
                毎月付与されるポイントは、次の月の付与でリセットされます（繰越なし）。
                <br />
                登録時のボーナスは、付与から 1 年で失効します。
                <br />
                シーンのアンロックにポイントを消費するのは初回のみで、その後 1 年間は同じシーンを無償で再視聴できます。
                <br />1 物件に複数シーンがある場合（例: 4 部屋あるスタジオ）は、シーンごとに個別に消費されます。
              </>
            )}
          </p>
        </div>}
        {/* 「支払 / アップグレード」の注記は 2026-11-10 本人指示で削除 */}
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
