import Link from "next/link";

export const metadata = {
  title: "料金プラン",
  description:
    "ロケハン3D オンラインのサブスクリプション料金。スタジオ閲覧から法人プロダクションまで。",
};

const PLANS = [
  {
    code: "FREE",
    name: "Free",
    price: 0,
    unit: "",
    desc: "サムネイル + 写真ギャラリーまで。3DGS ウォークスルー不可。",
    features: [
      "全物件のサムネイル閲覧",
      "リファレンス写真の閲覧",
      "見積もり依頼（1 件 / 月）",
    ],
    cta: "Sign up",
    href: "/sign-up",
    accent: false,
  },
  {
    code: "INDIVIDUAL",
    name: "Individual",
    price: 4800,
    unit: "/月",
    desc: "個人のフリーランス向け。3DGS ウォークスルー使い放題。",
    features: [
      "全物件の 3DGS ウォークスルー",
      "見積もり依頼 無制限",
      "オフライン PWA キャッシュ（β）",
      "履歴・ブックマーク保存",
    ],
    cta: "Subscribe",
    href: "/sign-up?plan=individual",
    accent: true,
  },
  {
    code: "TEAM",
    name: "Team",
    price: 24000,
    unit: "/月 (5 名)",
    desc: "プロダクション・スタジオ向け。共同視聴とブランディング。",
    features: [
      "Individual の全機能",
      "5 メンバー / 追加 ¥4,000・名",
      "ライブ共同視聴セッション",
      "案件ごとの 3DGS データ書き出し",
      "請求書一括（電子帳簿対応）",
    ],
    cta: "営業に相談",
    href: "https://web.locahun3d.com/locahun3d_contact.html",
    accent: false,
  },
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
        <h1 className="serif text-[clamp(2rem,4vw,3.6rem)] font-light leading-[1.3] max-w-[20ch] mx-auto">
          3DGS ウォークスルーは、
          <br />
          <em className="not-italic text-accent">サブスク</em> で開きます。
        </h1>
        <p className="mt-6 text-[14px] text-muted max-w-[50ch] mx-auto leading-[1.85]">
          月の打合せで「もう一回見に行きたい」が無くなる、と思えば。
          無料枠でも写真と概要は見られます。
        </p>
      </header>

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

      <div className="mt-16 grid md:grid-cols-3 gap-6 text-[12px] text-muted">
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">支払</div>
          <p>クレジットカード（Stripe 経由）。請求書払いは Team プラン以上で対応。</p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">解約</div>
          <p>いつでも解約可。日割り返金なし、次回更新で停止します。</p>
        </div>
        <div className="border-t border-line pt-5">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">3Dデータ販売</div>
          <p>スタジオ・撮影者向けに、3DGS データ販売 / マーケットプレイス機能を準備中。</p>
        </div>
      </div>
    </div>
  );
}
