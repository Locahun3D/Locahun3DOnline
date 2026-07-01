import Link from "next/link";
import Jp from "@/components/jp";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref, translate, type DictKey } from "@/lib/i18n/dictionaries";

export const metadata = {
  title: "サービスについて",
  description:
    "ロケハン3D オンラインは、スタジオ・ロケ地を地図検索 + 3DGS で下見し、ブラウザだけで撮影前ロケハンを完結するオンライン・プラットフォームです。",
};

export default async function AboutPage() {
  const locale = await getLocale();
  const t = (k: DictKey) => translate(locale, k);
  const lh = (href: string) => localizedHref(href, locale);
  const J = ({ k }: { k: DictKey }) =>
    locale === "ja" ? <Jp>{t(k)}</Jp> : <>{t(k)}</>;
  const FEATURES: { n: string; h: DictKey; p: DictKey }[] = [
    { n: "01", h: "about.f1.h", p: "about.f1.p" },
    { n: "02", h: "about.f2.h", p: "about.f2.p" },
    { n: "03", h: "about.f3.h", p: "about.f3.p" },
  ];
  return (
    <div className="theme-online frame pt-12 pb-32">
      {/* Title block */}
      <header className="text-center max-w-[60ch] mx-auto mb-16">
        <div className="mono text-[10px] tracking-[0.4em] uppercase text-accent mb-3">
          LOCAHUN 3D / ONLINE
        </div>
        <h1 className="serif text-[clamp(2rem,4vw,3.4rem)] font-bold leading-[1.3] mb-5">
          {t("about.h1")}
        </h1>
        <p className="text-[14px] text-muted leading-[1.95]">
          <J k="about.intro" />
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
              <h3 className="serif text-[1.5rem] font-bold leading-[1.5] mb-3">{t(f.h)}</h3>
              <p className="text-[13px] leading-[1.9] text-muted">
                <J k={f.p} />
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
          <J k="about.plans" />
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href={lh("/properties")}
            className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            {t("about.cta.browse")} →
          </Link>
          <Link
            href={lh("/pricing")}
            className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-line hover:border-ink transition"
          >
            {t("about.cta.pricing")}
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
          <J k="about.audience" />
        </p>
      </section>
    </div>
  );
}
