import Link from "next/link";
import ScanMark from "@/components/scan-mark";
import Jp from "@/components/jp";
import GatewayOverlay from "@/components/gateway-overlay";

// トップはスキャン/オンライン両義のため、ファビコンは白 (ヘッダーアイコンと連動)。
export const metadata = { icons: { icon: "/icon-white.svg" } };

export default function HomePage() {
  return (
    <>
      {/* SPLIT GATEWAY — manifesto-grade hero, two product lines */}
      <section className="split-gateway relative grid md:grid-cols-2 border-b border-line min-h-[70vh] md:min-h-[90vh] overflow-hidden bg-bg">
        {/* Timecode corners */}
        <span className="hidden sm:block absolute top-5 left-8 z-30 mono text-[10px] tracking-[0.28em] uppercase text-muted opacity-50 pointer-events-none">
          REEL 01 — INT.STUDIO
        </span>
        <span className="hidden sm:block absolute top-5 right-8 z-30 mono text-[10px] tracking-[0.28em] uppercase text-muted opacity-50 pointer-events-none">
          2027 / LOCAHUN 3D
        </span>

        {/* Center divider */}
        <div className="gateway-divider hidden md:block absolute top-[15%] bottom-[15%] left-1/2 -translate-x-1/2 z-20 w-px bg-gradient-to-b from-transparent via-line to-transparent pointer-events-none" />

        {/* Left — SCAN → 製品サイト (同タブ) */}
        <a
          href="https://web.locahun3d.com/"
          className="split-panel group relative flex flex-col justify-center items-center text-center px-6 sm:px-8 lg:px-16 pt-28 sm:pt-48 pb-16 sm:pb-28 border-b md:border-b-0 md:border-r border-line overflow-hidden"
        >
          {/* Hover glow — multi-layered */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(255,180,84,.1) 0%, transparent 60%)" }} />
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 delay-200 pointer-events-none"
            style={{ background: "radial-gradient(circle at 50% 80%, rgba(255,180,84,.05) 0%, transparent 50%)" }} />
          <span className="leader text-[42vw] md:text-[22vw] serif transition-all duration-700 group-hover:scale-110 group-hover:opacity-[0.06]">1</span>
          <div className="relative z-10 flex flex-col items-center transition-transform duration-700 ease-out group-hover:-translate-y-3">
            <div className="mono text-[10px] tracking-[0.45em] text-muted opacity-50 mb-5 whitespace-nowrap transition-all duration-700 group-hover:tracking-[0.6em] group-hover:opacity-70">
              L · O · C · A · H · U · N&nbsp;&nbsp;&nbsp;3&nbsp;D
            </div>
            <ScanMark size={42} className="scan-mark-icon mb-6 transition-transform duration-700 group-hover:scale-110" />
            <div className="brand flex items-center justify-center gap-4 text-[clamp(0.85rem,1.2vw,1.05rem)] tracking-[0.28em] text-ink/85 mb-5">
              <span className="w-9 h-px bg-current opacity-50 transition-all duration-700 group-hover:w-16 group-hover:opacity-80" />
              ロケハン3D
              <span className="w-9 h-px bg-current opacity-50 transition-all duration-700 group-hover:w-16 group-hover:opacity-80" />
            </div>
            <h2 className="brand text-[clamp(2.6rem,5.2vw,4.6rem)] leading-none tracking-[-0.01em] transition-all duration-700 group-hover:text-accent group-hover:scale-105">
              スキャン
            </h2>
            <p className="mt-7 max-w-[30ch] text-[13px] text-muted leading-[2] opacity-70 transition-all duration-700 delay-100 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2">
              <Jp>
                実空間を 3D Gaussian Splatting
                でスキャンし、現場をまるごとデータ化して持ち帰る。撮影・制作のための実測
                3D。
              </Jp>
            </p>
            <span className="mt-8 inline-flex items-center gap-2 mono text-[11px] tracking-[0.24em] uppercase text-accent opacity-60 transition-all duration-500 delay-200 group-hover:opacity-100">
              スキャンを見る
              <span className="group-hover:translate-x-3 transition-transform duration-500">↗</span>
            </span>
          </div>
        </a>

        {/* Right — ONLINE */}
        <Link
          href="/properties"
          className="split-panel group relative flex flex-col justify-center items-center text-center px-6 sm:px-8 lg:px-16 pt-28 sm:pt-48 pb-16 sm:pb-28 overflow-hidden"
        >
          {/* Hover glow — multi-layered */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(94,200,232,.1) 0%, transparent 60%)" }} />
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 delay-200 pointer-events-none"
            style={{ background: "radial-gradient(circle at 50% 80%, rgba(94,200,232,.05) 0%, transparent 50%)" }} />
          <span className="leader text-[42vw] md:text-[22vw] serif transition-all duration-700 group-hover:scale-110 group-hover:opacity-[0.06]">2</span>
          <div className="relative z-10 flex flex-col items-center transition-transform duration-700 ease-out group-hover:-translate-y-3">
            <div className="mono text-[10px] tracking-[0.45em] text-muted opacity-50 mb-5 whitespace-nowrap transition-all duration-700 group-hover:tracking-[0.6em] group-hover:opacity-70">
              L · O · C · A · H · U · N&nbsp;&nbsp;&nbsp;3&nbsp;D
            </div>
            <ScanMark size={42} reticle="#5ec8e8" className="scan-mark-icon mb-6 transition-transform duration-700 group-hover:scale-110" />
            <div className="brand flex items-center justify-center gap-4 text-[clamp(0.85rem,1.2vw,1.05rem)] tracking-[0.28em] text-ink/85 mb-5">
              <span className="w-9 h-px bg-current opacity-50 transition-all duration-700 group-hover:w-16 group-hover:opacity-80" />
              ロケハン3D
              <span className="w-9 h-px bg-current opacity-50 transition-all duration-700 group-hover:w-16 group-hover:opacity-80" />
            </div>
            <h2 className="brand text-[clamp(2.6rem,5.2vw,4.6rem)] leading-none tracking-[-0.01em] transition-all duration-700 group-hover:text-[#5ec8e8] group-hover:scale-105">
              オンライン
            </h2>
            <p className="mt-7 max-w-[30ch] text-[13px] text-muted leading-[2] opacity-70 transition-all duration-700 delay-100 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2">
              <Jp>
                ブラウザだけで撮影前ロケハン。スタジオ・倉庫・住宅・屋外ロケ地を 3D
                で検索し、構図・レンズ・光・動線を現場に行かず検証する。
              </Jp>
            </p>
            <span className="mt-8 inline-flex items-center gap-2 mono text-[11px] tracking-[0.24em] uppercase text-[#5ec8e8] opacity-60 transition-all duration-500 delay-200 group-hover:opacity-100">
              オンラインを見る
              <span className="group-hover:translate-x-3 transition-transform duration-500">→</span>
            </span>
          </div>
        </Link>

        {/* Scroll hint */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 mono text-[10px] tracking-[0.3em] uppercase text-muted scroll-hint pointer-events-none">
          ↓&nbsp;&nbsp;SCROLL
        </div>

        {/* Click-through cinematic overlay */}
        <GatewayOverlay />
      </section>

      {/* ABOUT — what Locahun3D is (two lines) */}
      <section className="frame py-24 border-b border-line">
        <div className="chapter-rule">
          <span className="opacity-60">01</span>
          <span>About — ロケハン3D とは</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <p className="brand text-[clamp(1.35rem,2.6vw,2rem)] leading-[1.6] max-w-[30ch] mx-auto text-center mb-14">
          <Jp>ロケハン3D は、実空間を 3D で扱う 2つのサービスです。</Jp>
        </p>
        <div className="grid md:grid-cols-2 gap-px bg-line">
          <a
            href="https://web.locahun3d.com/"
            className="group bg-bg p-8 hover:bg-[#1d1b18] transition-colors text-center"
          >
            <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-3">
              01 / SCAN
            </div>
            <h3 className="brand text-xl mb-3">ロケハン3D スキャン</h3>
            <p className="text-[14px] text-muted leading-[1.9] max-w-[40ch] mx-auto">
              <Jp>
                現場に出張し、実空間を 3D Gaussian Splatting
                でデータ化。撮影・制作のための実測 3D を作ります。
              </Jp>
            </p>
            <span className="mt-5 inline-block mono text-[10px] tracking-[0.24em] uppercase text-muted group-hover:text-accent transition">
              スキャンを見る ↗
            </span>
          </a>
          <Link
            href="/properties"
            className="group bg-bg p-8 hover:bg-[#1d1b18] transition-colors text-center"
          >
            <div className="mono text-[10px] tracking-[0.32em] uppercase text-[#5ec8e8] mb-3">
              02 / ONLINE
            </div>
            <h3 className="brand text-xl mb-3">ロケハン3D オンライン</h3>
            <p className="text-[14px] text-muted leading-[1.9] max-w-[40ch] mx-auto">
              <Jp>
                スキャンした空間をブラウザで検証・共有・貸出。撮影前ロケハンとスタジオ検索を遠隔で完結します。
              </Jp>
            </p>
            <span className="mt-5 inline-block mono text-[10px] tracking-[0.24em] uppercase text-[#5ec8e8]">
              オンラインを見る →
            </span>
          </Link>
        </div>
      </section>

      {/* CTA — monochrome (white gothic) */}
      <section className="frame py-32 text-center border-t border-line">
        <div className="brand text-[clamp(1.8rem,3.6vw,2.8rem)] leading-[1.5] max-w-[32ch] mx-auto">
          あなたの現場を、3Dに。
        </div>
        <p className="mt-8 text-[14px] text-muted leading-[2] max-w-[40ch] mx-auto">
          <Jp>
            スキャンして持ち帰り、オンラインで活かす。撮影前の往復を、ブラウザの中へ。
          </Jp>
        </p>
        <div className="mt-10 flex justify-center gap-3 flex-wrap">
          <a
            href="https://web.locahun3d.com/"
            className="px-7 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-ink text-ink hover:bg-ink hover:text-bg transition"
          >
            スキャンを相談
          </a>
          <Link
            href="/sign-up"
            className="px-7 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-line text-muted hover:border-ink hover:text-ink transition"
          >
            オンラインに登録
          </Link>
        </div>
      </section>
    </>
  );
}
