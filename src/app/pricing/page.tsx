import Link from "next/link";

export const metadata = {
  title: "料金プラン",
  description:
    "ロケハン3D オンラインのサブスクリプション料金。閲覧から法人プロダクションまで 3 プラン。",
};

const PLANS = [
  {
    code: "FREE",
    name: "Free",
    price: 0,
    unit: "",
    desc: "登録不要で物件カタログを閲覧。写真ギャラリーまで。",
    features: [
      "全物件のサムネイル・写真閲覧",
      "地図・フィルタ・距離検索",
      "見積もり依頼 月 1 件まで",
      "3DGS ウォークスルーは不可",
    ],
    cta: "Sign up",
    href: "/sign-up",
    accent: false,
    note: null,
  },
  {
    code: "INDIVIDUAL",
    name: "Individual",
    price: 5200,
    unit: "/月",
    desc: "個人のフリーランス・小規模制作者向け。図面とブックマークが解放。",
    features: [
      "図面ダウンロード 無制限",
      "履歴・ブックマーク保存",
      "3DGS ウォークスルー 月 3 件まで",
      "ログイン端末制限なし (PC/スマホ/タブレット併用 OK)",
      "見積もり依頼 無制限",
    ],
    cta: "Subscribe",
    href: "/sign-up?plan=individual",
    accent: true,
    note: null,
  },
  {
    code: "TEAM",
    name: "Team",
    price: 29800,
    unit: "/月",
    desc: "プロダクション・スタジオ向け。全機能 + チーム共有。",
    features: [
      "Individual の全機能を含む",
      "3DGS ウォークスルー 月 20 件まで",
      "20 端末まで同時ログイン可",
      "案件ごとの 3DGS データ書き出し",
      "請求書一括 (電子帳簿対応)",
      "3DGS データ ダウンロード 20% OFF",
    ],
    cta: "営業に相談",
    href: "https://web.locahun3d.com/locahun3d_contact.html",
    accent: false,
    note: "3DGS データ自体のダウンロード(再利用権)はスタジオ側ライセンスが必要です。Team プランでは買取価格から 20% 割引が適用されます。",
  },
];

const COMPARE_ROWS: Array<{
  label: string;
  free: string;
  individual: string;
  team: string;
}> = [
  { label: "物件カタログ閲覧",      free: "✓", individual: "✓",             team: "✓" },
  { label: "写真ギャラリー",        free: "✓", individual: "✓",             team: "✓" },
  { label: "地図 + 距離検索",       free: "✓", individual: "✓",             team: "✓" },
  { label: "図面ダウンロード",      free: "—", individual: "無制限",        team: "無制限" },
  { label: "履歴・ブックマーク",    free: "—", individual: "✓",             team: "✓" },
  { label: "3DGS ウォークスルー",   free: "—", individual: "月 3 件",       team: "月 20 件" },
  { label: "ログイン端末数",        free: "—", individual: "制限なし",      team: "20 端末まで" },
  { label: "見積もり依頼",          free: "月 1 件", individual: "無制限",  team: "無制限" },
  { label: "3DGS データ DL (再利用権)", free: "—", individual: "—",         team: "20% OFF" },
  { label: "請求書 / 電子帳簿対応", free: "—", individual: "—",             team: "✓" },
];

export default function PricingPage() {
  return (
    <div className="frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">PRICING</span>
        <span>Plans</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="text-center mb-16">
        <h1 className="serif text-[clamp(2rem,4vw,3.6rem)] font-light leading-[1.3] max-w-[24ch] mx-auto">
          下見の往復を、
          <br />
          <em className="not-italic text-accent">サブスク</em> 一枚に。
        </h1>
        <p className="mt-6 text-[14px] text-muted max-w-[54ch] mx-auto leading-[1.85]">
          写真と図面はどのプランでも閲覧可能。3DGS ウォークスルーは月の閲覧数で
          プランが分かれます。法人案件は Team プランからどうぞ。
        </p>
      </header>

      {/* Three plan cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((p) => (
          <div
            key={p.code}
            className={
              "border p-7 flex flex-col gap-5 " +
              (p.accent
                ? "border-accent bg-[#0c0905]"
                : "border-line bg-[#070707]")
            }
          >
            <div>
              <div
                className={
                  "mono text-[10px] tracking-[0.32em] uppercase " +
                  (p.accent ? "text-accent" : "opacity-50")
                }
              >
                {p.code}
              </div>
              <div className="serif text-3xl mt-2">{p.name}</div>
            </div>

            <div className="border-y border-line py-5">
              <div className="flex items-baseline gap-1">
                <span className="serif text-4xl">
                  {p.price === 0 ? "¥0" : `¥${p.price.toLocaleString("ja-JP")}`}
                </span>
                <span className="mono text-[11px] tracking-[0.18em] opacity-50">
                  {p.unit}
                </span>
              </div>
              <p className="text-[13px] text-muted mt-3 leading-[1.7]">{p.desc}</p>
            </div>

            <ul className="text-[13px] space-y-2 leading-[1.7] text-muted">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-accent mt-1">▸</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {p.note && (
              <p className="text-[11px] text-muted leading-[1.6] border-t border-line pt-3">
                {p.note}
              </p>
            )}

            <div className="mt-auto pt-4">
              <Link
                href={p.href}
                className={
                  "block text-center w-full px-5 py-3 mono text-[11px] tracking-[0.24em] uppercase border transition " +
                  (p.accent
                    ? "border-accent text-accent hover:bg-accent hover:text-bg"
                    : "border-line hover:border-ink")
                }
              >
                {p.cta}
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison table */}
      <section className="mt-20">
        <div className="chapter-rule">
          <span className="opacity-60">COMPARE</span>
          <span>Feature matrix</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>

        <div className="border border-line overflow-x-auto">
          <table className="w-full text-[13px] mono">
            <thead>
              <tr className="bg-[#080808] border-b border-line">
                <th className="text-left px-4 py-3 mono text-[10px] tracking-[0.28em] uppercase opacity-60 font-normal">
                  機能
                </th>
                <th className="px-4 py-3 mono text-[11px] tracking-[0.22em] uppercase font-normal">
                  Free
                </th>
                <th className="px-4 py-3 mono text-[11px] tracking-[0.22em] uppercase text-accent font-normal">
                  Individual
                </th>
                <th className="px-4 py-3 mono text-[11px] tracking-[0.22em] uppercase font-normal">
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
                  <td className="px-4 py-3 text-left text-ink/90">{row.label}</td>
                  <td className="px-4 py-3 text-center text-muted">{row.free}</td>
                  <td className="px-4 py-3 text-center text-accent">{row.individual}</td>
                  <td className="px-4 py-3 text-center">{row.team}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ-ish footer notes */}
      <div className="mt-16 grid md:grid-cols-3 gap-6 text-[12px] text-muted">
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            支払
          </div>
          <p>
            クレジットカード (Stripe 経由)。請求書払いは Team プランで対応。
            年払いの割引は今後追加予定。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            3DGS の月次カウント
          </div>
          <p>
            「ウォークスルーを開いた物件数」を月初リセットでカウント。
            同じ物件を再訪してもカウントは増えません。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            3DGS データ自体の DL
          </div>
          <p>
            ウォークスルー視聴と異なり、splat / ply データの再利用権はスタジオ側
            ライセンスが必要です。Team プラン契約者は買取価格から
            <strong className="text-accent"> 20% OFF</strong> が適用されます。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            解約
          </div>
          <p>いつでも解約可。日割り返金なし、次回更新で停止します。</p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            アップグレード
          </div>
          <p>
            Individual → Team はワンクリック。差額は日割りで即時請求されます。
          </p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
            スタジオ運営者向け
          </div>
          <p>
            自スタジオを掲載したい方は <a href="https://web.locahun3d.com/locahun3d_contact.html" className="text-accent hover:underline">お問い合わせ</a>{" "}
            から。掲載側は別建ての料金体系となります。
          </p>
        </div>
      </div>
    </div>
  );
}
