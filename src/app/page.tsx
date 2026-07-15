import Link from "next/link";
import ScanMark from "@/components/scan-mark";
import Jp from "@/components/jp";
import GatewayOverlay from "@/components/gateway-overlay";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref, translate, type DictKey } from "@/lib/i18n/dictionaries";

// トップはスキャン/オンライン両義のため、ファビコンは白 (ヘッダーアイコンと連動)。
export const metadata = { icons: { icon: "/icon-white.svg" } };

export default async function HomePage() {
  const locale = await getLocale();
  const t = (k: DictKey) => translate(locale, k);
  const lh = (href: string) => localizedHref(href, locale);
  // EN時はスキャンサイトのEN版へ（サイト間でEN維持）。
  const scanUrl =
    locale === "en" ? "https://web.locahun3d.com/en/" : "https://web.locahun3d.com/";
  // EN は BudouX(<Jp>) を通さず素のテキストにする。
  const J = ({ k }: { k: DictKey }) =>
    locale === "ja" ? <Jp>{t(k)}</Jp> : <>{t(k)}</>;
  return (
    <>
      {/* SPLIT GATEWAY — manifesto-grade hero, two product lines */}
      <section className="split-gateway relative grid md:grid-cols-2 border-b border-line min-h-[60vh] md:min-h-[90vh] overflow-hidden bg-bg">
        {/* Timecode corners */}
        <span className="hidden sm:block absolute top-5 left-8 z-30 mono text-[10px] tracking-[0.28em] uppercase text-muted opacity-50 pointer-events-none">
          REEL 01 — INT.STUDIO
        </span>
        <span className="hidden sm:block absolute top-5 right-8 z-30 mono text-[10px] tracking-[0.28em] uppercase text-muted opacity-50 pointer-events-none">
          2027 / LOCAHUN 3D
        </span>

        {/* Left — SCAN → 製品サイト (同タブ) */}
        <a
          href={scanUrl}
          className="split-panel group relative flex flex-col justify-center items-center text-center px-6 sm:px-8 lg:px-16 py-4 sm:py-16 min-h-[43vh] md:min-h-0 border-b md:border-b-0 md:border-r border-line overflow-hidden"
        >
          {/* Hover glow */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(255,180,84,.08) 0%, transparent 70%)" }} />
          <span className="leader text-[20vw] sm:text-[42vw] md:text-[22vw] serif transition-all duration-700 group-hover:scale-110 group-hover:opacity-[0.06]">1</span>
          <div className="relative z-10 flex flex-col items-center transition-transform duration-500 ease-out group-hover:-translate-y-2">
            <div className="hidden sm:block mono text-[10px] tracking-[0.45em] text-muted opacity-50 mb-5 whitespace-nowrap">
              L · O · C · A · H · U · N&nbsp;&nbsp;&nbsp;3&nbsp;D
            </div>
            <ScanMark size={42} className="mb-3 sm:mb-6 transition-transform duration-500 group-hover:scale-110" />
            <div className="brand flex items-center justify-center gap-4 text-[clamp(0.85rem,1.2vw,1.05rem)] tracking-[0.28em] text-ink/85 mb-2 sm:mb-5">
              <span className="w-9 h-px bg-current opacity-50 transition-all duration-500 group-hover:w-14 group-hover:opacity-80" />
              ロケハン3D
              <span className="w-9 h-px bg-current opacity-50 transition-all duration-500 group-hover:w-14 group-hover:opacity-80" />
            </div>
            <h2 className="brand text-[clamp(2rem,5.2vw,5.8rem)] leading-none tracking-[-0.01em] transition-all duration-500 group-hover:text-accent group-hover:scale-105">
              {t("home.scan.h2")}
            </h2>
            <p className="mt-3 sm:mt-7 max-w-[30ch] text-[12px] sm:text-[13px] text-muted leading-[1.6] sm:leading-[2] transition-opacity duration-500 group-hover:opacity-100">
              <J k="home.scan.desc" />
            </p>
            <span className="mt-4 sm:mt-8 inline-flex items-center gap-2 mono text-[11px] tracking-[0.24em] uppercase text-accent transition-all duration-300">
              {t("home.scan.cta")}
              <span className="group-hover:translate-x-2 transition-transform duration-300">↗</span>
            </span>
          </div>
        </a>

        {/* Right — ONLINE */}
        <Link
          href={lh("/properties")}
          className="split-panel group relative flex flex-col justify-center items-center text-center px-6 sm:px-8 lg:px-16 py-4 sm:py-16 min-h-[43vh] md:min-h-0 overflow-hidden"
        >
          {/* Hover glow */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(94,200,232,.08) 0%, transparent 70%)" }} />
          <span className="leader text-[20vw] sm:text-[42vw] md:text-[22vw] serif transition-all duration-700 group-hover:scale-110 group-hover:opacity-[0.06]">2</span>
          <div className="relative z-10 flex flex-col items-center transition-transform duration-500 ease-out group-hover:-translate-y-2">
            <div className="hidden sm:block mono text-[10px] tracking-[0.45em] text-muted opacity-50 mb-5 whitespace-nowrap">
              L · O · C · A · H · U · N&nbsp;&nbsp;&nbsp;3&nbsp;D
            </div>
            <ScanMark size={42} reticle="#5ec8e8" className="mb-3 sm:mb-6 transition-transform duration-500 group-hover:scale-110" />
            <div className="brand flex items-center justify-center gap-4 text-[clamp(0.85rem,1.2vw,1.05rem)] tracking-[0.28em] text-ink/85 mb-2 sm:mb-5">
              <span className="w-9 h-px bg-current opacity-50 transition-all duration-500 group-hover:w-14 group-hover:opacity-80" />
              ロケハン3D
              <span className="w-9 h-px bg-current opacity-50 transition-all duration-500 group-hover:w-14 group-hover:opacity-80" />
            </div>
            <h2 className="brand text-[clamp(2rem,5.2vw,5.8rem)] leading-none tracking-[-0.01em] transition-all duration-500 group-hover:text-[#5ec8e8] group-hover:scale-105">
              {t("home.online.h2")}
            </h2>
            <p className="mt-3 sm:mt-7 max-w-[30ch] text-[12px] sm:text-[13px] text-muted leading-[1.6] sm:leading-[2] transition-opacity duration-500 group-hover:opacity-100">
              <J k="home.online.desc" />
            </p>
            <span className="mt-4 sm:mt-8 inline-flex items-center gap-2 mono text-[11px] tracking-[0.24em] uppercase text-[#5ec8e8] transition-all duration-300">
              {t("home.online.cta")}
              <span className="group-hover:translate-x-2 transition-transform duration-300">→</span>
            </span>
          </div>
        </Link>

        {/* Scroll hint */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 mono text-[10px] tracking-[0.3em] uppercase text-muted scroll-hint pointer-events-none">
          ↓&nbsp;&nbsp;SCROLL
        </div>

        {/* Click-through ripple overlay */}
        <GatewayOverlay />
      </section>

      {/* ABOUT — what Locahun3D is (two lines) */}
      <section className="frame py-14 md:py-20 border-b border-line">
        <div className="chapter-rule">
          <span className="opacity-60">01</span>
          <span>{t("home.about.eyebrow")}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <p className="brand text-[clamp(1.35rem,2.6vw,2rem)] leading-[1.6] max-w-[30ch] mx-auto text-center mb-14">
          <J k="home.about.lead" />
        </p>
        <div className="grid md:grid-cols-2 gap-px bg-line">
          <a
            href={scanUrl}
            className="group bg-bg p-8 hover:bg-[#1d1b18] transition-colors text-center"
          >
            <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-3">
              01 / SCAN
            </div>
            <h3 className="brand text-xl mb-3">{t("home.about.scanTitle")}</h3>
            <p className="text-[14px] text-muted leading-[1.9] max-w-[40ch] mx-auto">
              <J k="home.about.scanDesc" />
            </p>
            <span className="mt-5 inline-block mono text-[10px] tracking-[0.24em] uppercase text-muted group-hover:text-accent transition">
              {t("home.about.scanCta")} ↗
            </span>
          </a>
          <Link
            href={lh("/properties")}
            className="group bg-bg p-8 hover:bg-[#1d1b18] transition-colors text-center"
          >
            <div className="mono text-[10px] tracking-[0.32em] uppercase text-[#5ec8e8] mb-3">
              02 / ONLINE
            </div>
            <h3 className="brand text-xl mb-3">{t("home.about.onlineTitle")}</h3>
            <p className="text-[14px] text-muted leading-[1.9] max-w-[40ch] mx-auto">
              <J k="home.about.onlineDesc" />
            </p>
            <span className="mt-5 inline-block mono text-[10px] tracking-[0.24em] uppercase text-[#5ec8e8]">
              {t("home.about.onlineCta")} →
            </span>
          </Link>
        </div>
      </section>

      {/* CTA — monochrome (white gothic) */}
      <section className="frame py-20 md:py-28 text-center border-t border-line">
        <div className="brand text-[clamp(1.8rem,3.6vw,2.8rem)] leading-[1.5] max-w-[32ch] mx-auto">
          {t("home.cta.headline")}
        </div>
        <p className="mt-8 text-[14px] text-muted leading-[2] max-w-[40ch] mx-auto">
          <J k="home.cta.sub" />
        </p>
        <div className="mt-10 flex justify-center gap-3 flex-wrap">
          <a
            href={scanUrl}
            className="px-7 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-ink text-ink hover:bg-ink hover:text-bg transition"
          >
            {t("home.cta.scanBtn")}
          </a>
          <Link
            href={lh("/sign-up")}
            className="px-7 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-line text-muted hover:border-ink hover:text-ink transition"
          >
            {t("home.cta.onlineBtn")}
          </Link>
        </div>
      </section>
    </>
  );
}
