import Link from "next/link";
import Jp from "@/components/jp";

export const metadata = {
  title: "サービスについて",
  description:
    "ロケハン3D オンラインは、スタジオ・ロケ地を地図検索 + 3DGS で下見し、ブラウザだけで撮影前ロケハンを完結するオンライン・プラットフォームです。",
};

const FEATURES = [
  {
    n: "01",
    h: "探す",
    p: "全国のスタジオ・倉庫・住宅・屋外ロケ地を、地図とフィルタで横断検索。料金・天井高・搬入・距離の条件で絞り込めます。",
  },
  {
    n: "02",
    h: "下見する",
    p: "3D Gaussian Splatting の実寸空間をブラウザで歩き、レンズ画角・光・天井・人の動線を現地に行かず検証できます。",
  },
  {
    n: "03",
    h: "決める",
    p: "チーム全員が同じ 3D を見て意思決定。そのまま見積もり・問い合わせへ。撮影前の往復をブラウザの中へ。",
  },
];

export default function AboutPage() {
  return (
    <div className="theme-online frame pt-12 pb-32">
      {/* Title block */}
      <header className="text-center max-w-[60ch] mx-auto mb-16">
        <div className="mono text-[10px] tracking-[0.4em] uppercase text-accent mb-3">
          LOCAHUN 3D / ONLINE
        </div>
        <h1 className="serif text-[clamp(2rem,4vw,3.4rem)] font-bold leading-[1.3] mb-5">
          サービスについて
        </h1>
        <p className="text-[14px] text-muted leading-[1.95]">
          <Jp>
            ロケハン3D オンラインは、撮影前ロケハンをブラウザだけで完結するオンライン・プラットフォームです。スタジオ・倉庫・住宅・屋外ロケ地を
            3D で検索・下見し、現場に行かず構図・レンズ・光・動線を検証できます。
          </Jp>
        </p>
      </header>

      {/* What you can do */}
      <section className="max-w-[1000px] mx-auto">
        <div className="chapter-rule justify-center">
          <span className="opacity-60">01</span>
          <span>What Locahun3D Online does</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="grid md:grid-cols-3 gap-10">
          {FEATURES.map((f) => (
            <div key={f.n} className="pt-7 border-t border-line text-center">
              <div className="mono text-[11px] tracking-[0.3em] text-accent mb-3">
                {f.n}
              </div>
              <h3 className="serif text-[1.5rem] font-bold leading-[1.5] mb-3">{f.h}</h3>
              <p className="text-[13px] leading-[1.9] text-muted">
                <Jp>{f.p}</Jp>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mt-24 max-w-[60ch] mx-auto text-center">
        <div className="chapter-rule justify-center">
          <span className="opacity-60">02</span>
          <span>Plans</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <p className="text-[14px] text-muted leading-[1.95] mb-7">
          <Jp>
            3DGS ウォークスルーはトークン制。Free / Individual / Studio / Team
            の月額プランから、利用規模に合わせて選べます。年払いで割引も。
          </Jp>
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/properties"
            className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            物件を探す →
          </Link>
          <Link
            href="/pricing"
            className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-line hover:border-ink transition"
          >
            料金プラン
          </Link>
        </div>
      </section>

      {/* Audience */}
      <section className="mt-24 max-w-[60ch] mx-auto text-center">
        <div className="chapter-rule justify-center">
          <span className="opacity-60">03</span>
          <span>For</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <p className="text-[14px] leading-[1.95]">
          <Jp>
            個人クリエイター・制作プロダクション・スタジオ運営者のためのサービスです。撮影監督・カメラマン・美術が同じ
            3D 空間で打合せできます。
          </Jp>
        </p>
      </section>
    </div>
  );
}
