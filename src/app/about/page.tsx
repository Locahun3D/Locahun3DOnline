import Link from "next/link";

export const metadata = {
  title: "サービスについて",
  description: "ロケハン3D ファミリーの各サービス紹介。本体 / オンライン版 / 将来構想。",
};

type ServiceStatus = "active" | "developing" | "planned";

const STATUS_META: Record<ServiceStatus, { label: string; cls: string }> = {
  active:     { label: "運営中",   cls: "bg-accent text-bg" },
  developing: { label: "開発中",   cls: "border border-accent text-accent" },
  planned:    { label: "構想中",   cls: "border border-line text-muted" },
};

interface Service {
  code: string;
  name: string;
  tagline: string;
  status: ServiceStatus;
  description: string;
  audience: string;
  highlights: string[];
  links: { href: string; label: string; external?: boolean }[];
}

const SERVICES: Service[] = [
  {
    code: "01",
    name: "ロケハン3D",
    tagline: "撮影前ロケハンを 3DGS で再発明する 本体プラットフォーム",
    status: "active",
    description:
      "PortalCam で実空間をスキャンし、3D Gaussian Splatting データとして提供する本体サービス。" +
      "撮影前にブラウザ・PC で空間を歩き回って下見できる、撮影業界のための総合プラットフォーム。",
    audience: "プロダクション / 撮影監督 / 美術 / ロケコーディネーター",
    highlights: [
      "PortalCam による現地スキャン",
      "オフラインビューアー (単体 HTML 配布)",
      "撮影委託 / 個別案件対応",
    ],
    links: [
      { href: "https://web.locahun3d.com/", label: "公式サイト ↗", external: true },
      { href: "https://viewer.locahun3d.com/Locahun3D_OfflineViewer", label: "オフラインビューアー ↗", external: true },
    ],
  },
  {
    code: "02",
    name: "ロケハン3D オンライン",
    tagline: "スタジオカタログ + ブラウザ視聴 SaaS",
    status: "active",
    description:
      "ロケハン3D ファミリーの SaaS サービス。スタジオ・ロケ地を地図検索 + 3DGS で下見し、" +
      "月額サブスクで継続利用できるブラウザ完結のプラットフォーム。" +
      "「SUUMO の撮影業界版」を目指す。",
    audience: "個人クリエイター / 制作プロダクション / スタジオ運営者",
    highlights: [
      "全国スタジオの地図 + フィルタ検索",
      "月次トークン制で 3DGS 視聴",
      "スタジオ運営者のセルフ掲載 (将来)",
    ],
    links: [
      { href: "/properties", label: "物件を探す" },
      { href: "/pricing", label: "料金プラン" },
    ],
  },
  {
    code: "03",
    name: "ロケハン3D Mobile",
    tagline: "現場での 3DGS 閲覧 / AR 重ね合わせアプリ",
    status: "planned",
    description:
      "iOS / Android アプリ。撮影現場でのオフライン 3DGS 閲覧、" +
      "AR 重ね合わせによるカメラポジション検証、その場でのカット割り共有。",
    audience: "撮影現場スタッフ / 監督 / アシスタント",
    highlights: [
      "オフライン閲覧 (事前同期)",
      "AR ライブビュー",
      "メモ・スクショの共有",
    ],
    links: [],
  },
  {
    code: "04",
    name: "ロケハン3D Enterprise",
    tagline: "大手プロダクション・代理店向け統合プラン",
    status: "planned",
    description:
      "Adobe / Unreal / Houdini / Maya パイプラインへの API 統合、" +
      "専用 SLA、データ専有契約、社内研修。チーム数百名規模を想定。",
    audience: "TV 局 / 大手プロダクション / 広告代理店",
    highlights: [
      "API + SDK 提供",
      "専有ライセンス",
      "オンサイト撮影 + 育成",
    ],
    links: [],
  },
];

const ROADMAP_NOTE =
  "ロケハン3D ファミリーは「撮影に必要なすべての空間を、3DGS で持ち帰る」を共通テーマに、" +
  "本体プラットフォーム → オンライン SaaS → モバイル → 大企業向けと順次展開していきます。";

export default function AboutPage() {
  return (
    <div className="frame pt-12 pb-32">
      {/* Center title block */}
      <header className="text-center max-w-[58ch] mx-auto mb-16">
        <div className="mono text-[10px] tracking-[0.4em] uppercase text-accent mb-3">
          ロケハン3D FAMILY
        </div>
        <h1 className="serif text-[clamp(2rem,4vw,3.4rem)] font-light leading-[1.3] mb-5">
          サービスについて
        </h1>
        <p className="text-[14px] text-muted leading-[1.95]">
          ロケハン3D は <em className="not-italic text-accent">複数のサービス</em> から構成されるファミリー
          ブランドです。「実空間を 3D ごと持ち帰る」を共通テーマに、それぞれ異なる
          ユーザー層と用途に向けて設計されています。
        </p>
      </header>

      {/* Distinct callout: 本体 vs オンライン */}
      <div className="max-w-[68ch] mx-auto mb-16 border border-line bg-[#070707] p-7 text-center">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-60 mb-3">
          ご注意
        </div>
        <p className="text-[14px] leading-[1.95]">
          <strong className="text-ink">「ロケハン3D」</strong> と{" "}
          <strong className="text-accent">「ロケハン3D オンライン」</strong>
          は <em className="not-italic text-accent">別サービス</em> です。
          <br />
          本体は撮影委託・スキャン制作、オンラインはスタジオ検索 SaaS。
          <br />
          ご利用前に、目的に合うサービスを下記からお選びください。
        </p>
      </div>

      {/* Service grid — 2 cols now, extends to 3 cols (lg) when family grows */}
      <section className="max-w-[1100px] mx-auto">
        <div className="chapter-rule justify-center">
          <span className="opacity-60">SERVICES</span>
          <span>ファミリー一覧</span>
          <span className="flex-1 h-px bg-current opacity-25" />
          <span className="opacity-60">{SERVICES.length} サービス</span>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {SERVICES.map((s) => {
            const meta = STATUS_META[s.status];
            const isFlagship = s.code === "01";
            return (
              <article
                key={s.code}
                className={`border p-7 flex flex-col gap-5 ${
                  isFlagship
                    ? "border-accent bg-[#0c0905]"
                    : s.status === "active"
                      ? "border-line bg-[#070707]"
                      : "border-line bg-[#050505] opacity-90"
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mb-1">
                      {s.code} {isFlagship && "/ FLAGSHIP"}
                    </div>
                    <h3 className="serif text-2xl leading-[1.3]">{s.name}</h3>
                  </div>
                  <span
                    className={`mono text-[9px] tracking-[0.24em] uppercase px-2 py-1 ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </div>

                {/* Tagline */}
                <p className="text-[13px] text-accent leading-[1.7]">
                  {s.tagline}
                </p>

                {/* Description */}
                <p className="text-[12px] text-muted leading-[1.85]">
                  {s.description}
                </p>

                {/* Audience */}
                <div>
                  <div className="mono text-[9px] tracking-[0.28em] uppercase opacity-60 mb-1.5">
                    対象
                  </div>
                  <div className="text-[12px]">{s.audience}</div>
                </div>

                {/* Highlights */}
                <div>
                  <div className="mono text-[9px] tracking-[0.28em] uppercase opacity-60 mb-1.5">
                    主な機能
                  </div>
                  <ul className="text-[12px] text-muted space-y-1">
                    {s.highlights.map((h) => (
                      <li key={h} className="flex gap-2">
                        <span className="text-accent">▸</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Links */}
                {s.links.length > 0 ? (
                  <div className="mt-auto pt-2 flex flex-wrap gap-2">
                    {s.links.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        target={l.external ? "_blank" : undefined}
                        rel={l.external ? "noopener" : undefined}
                        className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-2 hover:border-accent hover:text-accent transition"
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="mt-auto pt-2 mono text-[10px] tracking-[0.22em] uppercase opacity-50">
                    Coming later
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* Roadmap note */}
        <p className="mt-10 text-center text-[12px] text-muted leading-[1.85] max-w-[58ch] mx-auto">
          {ROADMAP_NOTE}
        </p>
      </section>

      {/* Common theme block */}
      <section className="mt-24 max-w-[60ch] mx-auto text-center">
        <div className="chapter-rule justify-center">
          <span className="opacity-60">SHARED VISION</span>
          <span>共通テーマ</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>

        <h2 className="serif text-[clamp(1.5rem,3vw,2.4rem)] font-light leading-[1.5] mb-5">
          オンラインで <em className="not-italic text-accent">ロケハン</em> が
          出来る時代。
        </h2>
        <p className="text-[13px] text-muted leading-[1.95]">
          ロケハン (撮影前下見) は映像制作で最もコストが高い工程の一つ。
          ロケハン3D ファミリーは、3D Gaussian Splatting でこの工程を再発明し、
          「行かなければ分からない」を「画面の中で分かる」に変換します。
        </p>
      </section>

      {/* Operator info */}
      <section className="mt-24 max-w-[58ch] mx-auto text-center">
        <div className="chapter-rule justify-center">
          <span className="opacity-60">COMPANY</span>
          <span>運営</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>

        <dl className="grid grid-cols-[100px_1fr] gap-y-3 text-[13px] text-left max-w-[44ch] mx-auto">
          <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
            運営者
          </dt>
          <dd>中村 航 (個人事業主、法人化準備中)</dd>
          <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
            所在地
          </dt>
          <dd>東京都清瀬市</dd>
          <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50">
            お問い合わせ
          </dt>
          <dd>
            <a
              href="mailto:contact@locahun3d.com"
              className="text-accent hover:underline"
            >
              contact@locahun3d.com
            </a>
          </dd>
        </dl>

        <p className="mt-6 text-[11px] text-muted leading-[1.75]">
          各サービスの詳細・契約・カスタム要望はお気軽にご連絡ください。
        </p>
      </section>
    </div>
  );
}
