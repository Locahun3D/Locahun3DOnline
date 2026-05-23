import PlanCards from "@/components/pricing/plan-cards";

export const metadata = {
  title: "料金プラン",
  description:
    "ロケハン3D オンラインの料金。Free / Individual / Studio / Team の 4 段 + トークン制 3DGS ウォークスルー。年払で -15%。",
};

const COMPARE_ROWS: Array<{
  label: string;
  free: string;
  individual: string;
  studio: string;
  team: string;
}> = [
  { label: "物件カタログ閲覧",       free: "✓",       individual: "✓",        studio: "✓",        team: "✓" },
  { label: "写真ギャラリー",         free: "✓",       individual: "✓",        studio: "✓",        team: "✓" },
  { label: "地図 + 距離検索",        free: "✓",       individual: "✓",        studio: "✓",        team: "✓" },
  { label: "図面ダウンロード",       free: "—",       individual: "無制限",   studio: "無制限",   team: "無制限" },
  { label: "履歴・ブックマーク",     free: "—",       individual: "永続",     studio: "永続+共有",team: "永続+共有" },
  { label: "3DGS ウォークスルー",    free: "登録時 1 トークン", individual: "月 8 トークン",  studio: "月 12 トークン", team: "月 30 トークン" },
  { label: "ログイン端末数",         free: "—",       individual: "制限なし", studio: "5 端末",   team: "20 端末" },
  { label: "見積もり依頼",           free: "月 1 件", individual: "無制限",   studio: "無制限",   team: "無制限" },
  { label: "請求書 / 電子帳簿対応",  free: "—",       individual: "—",        studio: "—",        team: "✓" },
  { label: "年払 -15% 適用",         free: "—",       individual: "✓",        studio: "✓",        team: "✓" },
];

export default function PricingPage() {
  return (
    <div className="frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">PRICING</span>
        <span>Plans</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="text-center mb-12">
        <h1 className="serif text-[clamp(2rem,4vw,3.6rem)] font-light leading-[1.3] max-w-[26ch] mx-auto">
          下見の往復を、
          <br />
          <em className="not-italic text-accent">サブスク</em> 一枚に。
        </h1>
        <p className="mt-6 text-[14px] text-muted max-w-[58ch] mx-auto leading-[1.85]">
          3DGS ウォークスルーは <em className="not-italic text-accent">トークン制</em>。
          スタジオの規模に応じてトークン消費が変わり、月の予算内で何件でも見られます。
          年払いで -15%、Studio が最もバランス良い選択肢です。
        </p>
      </header>

      {/* 4 plans + billing mode toggle */}
      <PlanCards />

      {/* Token system explainer */}
      <section className="mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">TOKENS</span>
          <span>3DGS Walkthrough Tokens</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="border border-line bg-[#070707] p-7">
            <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-2">
              SIZE → COST
            </div>
            <h3 className="serif text-2xl mb-4">スタジオサイズ別 トークン消費</h3>
            <table className="w-full text-[13px] mono">
              <tbody>
                <tr className="border-b border-line">
                  <td className="py-3 text-left text-ink">ハウス / 小規模 (〜150㎡)</td>
                  <td className="py-3 text-right text-accent text-lg">1 トークン</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-3 text-left text-ink">中規模スタジオ (150-400㎡)</td>
                  <td className="py-3 text-right text-accent text-lg">2 トークン</td>
                </tr>
                <tr>
                  <td className="py-3 text-left text-ink">ドーム / 大規模 / 屋外 (400㎡〜)</td>
                  <td className="py-3 text-right text-accent text-lg">3 トークン</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-muted mt-4 leading-[1.7]">
              トークンは月初リセット。同じ物件の再訪は追加消費なし。
              月の予算を超えた場合はプラン変更でその場でアップグレード可能です。
            </p>
          </div>

          <div className="border border-line bg-[#070707] p-7">
            <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-2">
              BUDGET → SHOOTS
            </div>
            <h3 className="serif text-2xl mb-4">月予算で見られる目安</h3>
            <table className="w-full text-[12px] mono">
              <thead>
                <tr className="border-b border-line text-[10px] tracking-[0.22em] uppercase opacity-60">
                  <th className="py-2 text-left font-normal">プラン</th>
                  <th className="py-2 text-right font-normal">ハウス</th>
                  <th className="py-2 text-right font-normal">中規模</th>
                  <th className="py-2 text-right font-normal">大規模</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line text-muted">
                  <td className="py-2.5 text-left">Free <span className="opacity-60">(登録時 1t 一度のみ)</span></td>
                  <td className="py-2.5 text-right">1 件</td>
                  <td className="py-2.5 text-right opacity-50">—</td>
                  <td className="py-2.5 text-right opacity-50">—</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2.5 text-left">Individual (8t)</td>
                  <td className="py-2.5 text-right">8 件</td>
                  <td className="py-2.5 text-right">4 件</td>
                  <td className="py-2.5 text-right">2 件</td>
                </tr>
                <tr className="border-b border-line text-accent">
                  <td className="py-2.5 text-left">Studio (12t)</td>
                  <td className="py-2.5 text-right">12 件</td>
                  <td className="py-2.5 text-right">6 件</td>
                  <td className="py-2.5 text-right">4 件</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-left">Team (30t)</td>
                  <td className="py-2.5 text-right">30 件</td>
                  <td className="py-2.5 text-right">15 件</td>
                  <td className="py-2.5 text-right">10 件</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-muted mt-4 leading-[1.7]">
              実際は混合 (ハウス + 中規模など) になるため、おおよその上限と考えてください。
              Free はアカウント作成時の 1 トークン (ハウス 1 件分) のみ — 月次更新はありません。
              ハウス中心の使い方なら Individual、複合的に使うなら Studio が経済的。
            </p>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">COMPARE</span>
          <span>Feature matrix</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>

        <div className="border border-line overflow-x-auto">
          <table className="w-full text-[12px] mono">
            <thead>
              <tr className="bg-[#080808] border-b border-line">
                <th className="text-left px-3 py-3 mono text-[10px] tracking-[0.24em] uppercase opacity-60 font-normal min-w-[160px]">
                  機能
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
                  key={row.label}
                  className={`border-b border-line ${i % 2 === 1 ? "bg-[#060606]" : ""}`}
                >
                  <td className="px-3 py-2.5 text-left text-ink/90">{row.label}</td>
                  <td className="px-3 py-2.5 text-center text-muted">{row.free}</td>
                  <td className="px-3 py-2.5 text-center text-muted">{row.individual}</td>
                  <td className="px-3 py-2.5 text-center text-accent">{row.studio}</td>
                  <td className="px-3 py-2.5 text-center">{row.team}</td>
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
            年払い -15% について
          </div>
          <p>
            年払いは初月にまとめて 12 ヶ月分を請求。途中解約の日割り返金はありません。
            キャッシュフロー前倒し + 解約率低下を狙う設計です。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            トークンの月次運用
          </div>
          <p>
            月初リセット式。同じ物件を再訪してもトークンは追加消費されません。
            月内に上限超過した場合は Studio / Team へのアップグレードで即解放できます。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            プランの選び方
          </div>
          <p>
            ハウススタジオ中心 → Individual。
            中〜大型を月に複数件見る制作チーム → <strong className="text-accent">Studio (推奨)</strong>。
            大手プロダクション → Team。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            支払 / アップグレード
          </div>
          <p>
            クレジットカード (Stripe)。Team は請求書払い対応。
            Individual ↔ Studio ↔ Team はワンクリック切替、差額は日割り。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            スタジオ運営者向け
          </div>
          <p>
            自スタジオを掲載したい方は{" "}
            <a href="https://web.locahun3d.com/locahun3d_contact.html" className="text-accent hover:underline">
              お問い合わせ
            </a>{" "}
            から。掲載側は別料金体系、データ販売の収益シェアも発生します。
          </p>
        </div>
      </div>
    </div>
  );
}
