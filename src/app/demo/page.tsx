import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import EstimateSimulator from "@/components/demo/estimate-simulator";

/**
 * /demo — 旧マーケサイト `web.locahun3d.com/locahun3d_demo.html`（EN: /en/…）の移植先。
 *
 * - 文言・金額は移植元のまま（創作しない）。計算ロジックは
 *   `src/components/demo/estimate-simulator.tsx` に複製してある。
 * - 移植元にあった Turnstile + マーケ worker 宛のお問い合わせフォームは持ち込まず、
 *   オンライン側の /contact へ誘導する（設計_サイト統合_スキャン分岐廃止_2026-08-16.md）。
 * - flatpickr 等の外部 CDN も持ち込まない。
 * - デザインは /about（白青・accent トークン・角丸8px・chapter-rule帯）に合わせる。
 */

const DEMO_URL = "https://viewer.locahun3d.com/Locahun3D_OfflineViewer?demo=1";

export async function generateMetadata() {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "Demo & Contact",
        description:
          "Try a sample 3DGS scene in your browser. Get an instant ballpark from shoot scale, number of locations and shoot date, then reach out for a detailed quote.",
      }
    : {
        title: "デモ・お問合せ",
        description:
          "サンプル 3DGS シーンをブラウザでお試し可能。撮影規模・地点数・撮影日から概算費用を即時算出し、そのままお問い合わせ・見積依頼まで完結します。",
      };
}

export default async function DemoPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">DEMO</span>
        <span>{en ? "Demo & Estimate Simulator" : "デモ・見積シミュレーター"}</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      {/* ── HERO ── */}
      <header className="text-center max-w-[60ch] mx-auto mb-12 sm:mb-16">
        <div className="mono text-[10px] tracking-[0.4em] uppercase text-accent mb-3">
          — DEMO &amp; CONTACT —
        </div>
        <h1 className="serif text-[clamp(1.55rem,4.5vw,3.6rem)] font-bold leading-[1.3]">
          {en ? (
            <>
              Demo &amp; <em className="not-italic text-accent">Contact</em>
            </>
          ) : (
            <>
              <em className="not-italic text-accent">デモ</em>・お問合せ
            </>
          )}
        </h1>
        <p className="mt-4 sm:mt-6 text-[14px] text-muted leading-[1.85]">
          {en ? (
            <>
              See it in action with the live demo.
              <br />
              From the form below, reach out for an inquiry or a quote.
            </>
          ) : (
            <>
              実際の動作はデモで体験できます。
              <br />
              下のフォームから、お問い合わせ・見積まで。
            </>
          )}
        </p>
      </header>

      {/* ── ビューアーデモ導線 ── */}
      <section className="grid lg:grid-cols-2 gap-8 lg:gap-10 items-stretch max-w-[1000px] mx-auto">
        <div className="flex flex-col gap-4 justify-center">
          <h2 className="serif text-[clamp(1.15rem,2vw,1.44rem)] font-bold leading-[1.35]">
            {en ? "Explore the sample scene" : "サンプルシーンを触る"}
          </h2>
          <div>
            <a
              className="min-h-[46px] px-4 py-3 inline-flex items-center justify-center bg-accent text-white border border-accent mono text-[11px] tracking-[0.22em] uppercase font-medium leading-[1.2] hover:opacity-90 transition-opacity"
              href={DEMO_URL}
              target="_blank"
              rel="noopener"
            >
              {en ? "Try it in your browser →" : "ブラウザで試す →"}
            </a>
          </div>
          <div className="mt-4 pt-5 border-t border-line flex flex-col gap-1.5">
            <span className="mono text-[10px] tracking-[0.3em] uppercase text-muted">
              {en ? "— Shoot Time" : "— Shoot Time / 撮影時間"}
            </span>
            <p className="text-[13px] leading-[1.85]">
              <strong className="text-accent font-semibold">
                {en ? "PortalCam walking scan, 20 min" : "PortalCam 歩行スキャン 20 分"}
              </strong>
            </p>
          </div>
        </div>

        <a
          className="relative block overflow-hidden rounded-md border border-line bg-white shadow-[0_20px_54px_rgba(15,23,42,.10)] min-h-[240px] group"
          href={DEMO_URL}
          target="_blank"
          rel="noopener"
          aria-label={
            en
              ? "Try it in your browser — explore the sample scene"
              : "ブラウザで試す — サンプルシーンを触る"
          }
        >
          {/* next/image は本構成で最適化404になるためプレーン <img> */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/demo-pcloud.webp"
            alt={
              en
                ? "A real photo blended with raw 3DGS point cloud data"
                : "実写に3DGSの生ポイントクラウドを重ねた比較画像"
            }
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="w-[60px] h-[60px] rounded-full bg-white/92 grid place-items-center shadow-[0_4px_24px_rgba(15,23,42,.35)] transition-transform group-hover:scale-105">
              <span className="w-0 h-0 ml-1 border-y-[9px] border-y-transparent border-l-[15px] border-l-ink" />
            </span>
          </span>
        </a>
      </section>

      {/* ── 料金シミュレーター ── */}
      <section id="estimate" className="mt-16 sm:mt-24 max-w-[1000px] mx-auto scroll-mt-24">
        <div className="chapter-rule">
          <span className="opacity-60">ESTIMATE</span>
          <span>{en ? "Estimate simulator" : "見積シミュレーター"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="serif text-[clamp(1.2rem,2.2vw,1.7rem)] font-bold leading-[1.35]">
            {en ? (
              <>
                Get an <em className="not-italic text-accent">estimate</em> from your project scale
              </>
            ) : (
              <>
                プロジェクト規模から、<em className="not-italic text-accent">概算</em>を出す
              </>
            )}
          </h2>
          <p className="mt-3 text-[13px] text-muted leading-[1.85]">
            {en
              ? "Just pick a shoot date and a few options. For a detailed quote, get in touch."
              : "撮影日と各項目を選ぶだけ。詳細見積はお問い合わせください。"}
          </p>
        </div>

        <EstimateSimulator en={en} />
      </section>

      {/* ── お問い合わせ導線（旧ページのフォームの代わり） ── */}
      <section id="contact" className="mt-16 sm:mt-24 max-w-[1000px] mx-auto scroll-mt-24">
        <div className="chapter-rule">
          <span className="opacity-60">CONTACT</span>
          <span>{en ? "Get in touch" : "お問い合わせ・見積依頼"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="grid lg:grid-cols-[1fr_auto] gap-7 items-center bg-accent text-white rounded-md px-6 py-8 sm:px-10 sm:py-10 shadow-[0_22px_60px_color-mix(in_srgb,var(--color-accent)_23%,transparent)]">
          <div>
            <h2 className="serif text-[clamp(1.2rem,2.2vw,1.7rem)] font-bold leading-[1.25]">
              {en ? "Contact" : "お問い合わせ"}
            </h2>
            <p className="mt-3 text-[13px] leading-[1.85] text-white/85">
              {en ? (
                <>
                  For consultations, demo requests, quotes and any other questions.
                  <br />
                  We usually reply within 2 business days.
                </>
              ) : (
                <>
                  導入のご相談、デモのリクエスト、見積のご依頼、その他ご質問はこちらから。
                  <br />
                  通常 2 営業日以内にご返信します。
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-3.5 lg:max-w-[280px] w-full">
            <Link
              href={lh("/contact")}
              className="min-h-[46px] px-4 py-3 inline-flex items-center justify-center bg-white text-accent border border-white mono text-[11px] tracking-[0.22em] uppercase font-medium leading-[1.2] hover:opacity-90 transition-opacity"
            >
              {en ? "Go to the contact form →" : "お問い合わせフォームへ →"}
            </Link>
            <Link
              href={lh("/privacy")}
              className="mono text-[10px] tracking-[0.16em] uppercase text-white/80 underline hover:no-underline text-center"
            >
              {en ? "Privacy Policy" : "プライバシーポリシー"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
