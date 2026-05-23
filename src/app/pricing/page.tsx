import Link from "next/link";
import PlanCards from "@/components/pricing/plan-cards";

export const metadata = {
  title: "料金プラン",
  description:
    "ロケハン3D オンラインの料金。Free / Individual / Studio / Team の 4 段 + 単発 Project Pass。年払で -15%。",
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
  { label: "3DGS ウォークスルー",    free: "生涯 1 件", individual: "月 5 件",  studio: "月 8 件",  team: "月 20 件" },
  { label: "ログイン端末数",         free: "—",       individual: "制限なし", studio: "5 端末",   team: "20 端末" },
  { label: "見積もり依頼",           free: "月 1 件", individual: "無制限",   studio: "無制限",   team: "無制限" },
  { label: "3DGS データ DL (再利用権)", free: "—",    individual: "—",        studio: "10% OFF",  team: "20% OFF" },
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
          <em className="not-italic text-accent">サブスク</em> または{" "}
          <em className="not-italic text-accent">1 案件パス</em> に。
        </h1>
        <p className="mt-6 text-[14px] text-muted max-w-[58ch] mx-auto leading-[1.85]">
          コンスタント案件には月額、単発撮影には 7 日パス。
          4 段プランで個人〜大手プロダクションまでカバー。年払いで -15%。
        </p>
      </header>

      {/* 4 plans + billing mode toggle */}
      <PlanCards />

      {/* Project Pass (separate spot purchase) */}
      <section className="mt-20">
        <div className="chapter-rule">
          <span className="opacity-60">SPOT PURCHASE</span>
          <span>Project Pass</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8 border border-accent bg-[#0c0905] p-8">
          <div>
            <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-2">
              NEW · ONE-TIME
            </div>
            <h2 className="serif text-3xl font-light mb-3">
              撮影 1 案件分、7 日間だけ。
            </h2>
            <p className="text-[14px] text-muted leading-[1.85] max-w-[60ch] mb-5">
              月の撮影頻度が低い方・案件単発で動くフリーランス向け。
              ロケハン期間 (撮影 1 週間前) に合わせて 7 日間、3DGS を 3 件まで閲覧できます。
              月額契約不要、解約手続きもありません。
            </p>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px] text-muted">
              <li className="flex gap-2"><span className="text-accent">▸</span>3DGS ウォークスルー 3 件まで</li>
              <li className="flex gap-2"><span className="text-accent">▸</span>図面ダウンロード 無制限 (期間中)</li>
              <li className="flex gap-2"><span className="text-accent">▸</span>有効期間 7 日</li>
              <li className="flex gap-2"><span className="text-accent">▸</span>履歴・ブックマーク 30 日保存</li>
              <li className="flex gap-2"><span className="text-accent">▸</span>解約・更新の手続き不要</li>
              <li className="flex gap-2"><span className="text-accent">▸</span>1 件あたり実質 ¥1,167</li>
            </ul>
          </div>
          <div className="border-l border-accent/40 pl-8 flex flex-col justify-center">
            <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-2">
              ONE-TIME PRICE
            </div>
            <div className="flex items-baseline gap-1">
              <span className="serif text-5xl text-accent">¥3,500</span>
            </div>
            <div className="mono text-[10px] text-muted mt-1">/ 7 日</div>
            <Link
              href="/sign-up?plan=pass"
              className="mt-6 block text-center px-5 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
            >
              パスを購入
            </Link>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="mt-20">
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
            年払いプランは初月にまとめて 12 ヶ月分を請求。途中解約での日割り返金はありません。
            キャッシュフロー前倒し + 解約率低下の双方を狙う設計です。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            3DGS の月次カウント
          </div>
          <p>
            「ウォークスルーを開いた物件数」を月初リセットでカウント。
            同じ物件を再訪してもカウントは増えません。Project Pass は 7 日間で 3 件まで。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            プランの選び方
          </div>
          <p>
            月 1 案件以下 → Pass、月 2-3 案件 → Individual、
            小規模制作会社 (チーム 3-5 名) → Studio、
            大手プロダクション → Team。迷ったらまず Free で 1 件試して下さい。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            支払
          </div>
          <p>
            クレジットカード (Stripe 経由)。請求書払いは Team プランで対応。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            アップグレード / ダウングレード
          </div>
          <p>
            Individual ↔ Studio ↔ Team はワンクリック。
            差額は日割りで即時請求 / 返金されます。
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
            から。掲載側は別建ての料金体系です。
          </p>
        </div>
      </div>
    </div>
  );
}
