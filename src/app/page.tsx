import Link from "next/link";
import {
  getPublishedProperties,
  CATEGORY_LABEL,
} from "@/lib/properties";
import type { PropertyCategory } from "@/lib/properties";
import PropertyCard from "@/components/property-card";

export default async function HomePage() {
  const all = await getPublishedProperties();
  // Sort by updatedAt desc explicitly — repo already does this, but be defensive
  // so the home "Latest" section never silently drifts if the repo's default sort changes.
  const latest = [...all]
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, 3);
  return (
    <>
      {/* HERO */}
      <section className="relative frame min-h-[88vh] flex flex-col justify-center items-center text-center overflow-hidden">
        <div className="absolute top-5 left-12 mono text-[10px] tracking-[0.32em] uppercase opacity-40">
          REEL 01 / FRAME 001
        </div>
        <div className="absolute top-5 right-12 mono text-[10px] tracking-[0.32em] uppercase opacity-40">
          TC 00:00:01:00
        </div>

        <div className="mono text-[11px] tracking-[0.5em] uppercase opacity-60 mb-10">
          LOCAHUN 3D / ONLINE — EST. 2027
        </div>

        <h1 className="serif font-light text-[clamp(2.4rem,5.6vw,5.4rem)] leading-[1.3] tracking-[0.03em] max-w-[18ch]">
          オンラインで
          <br />
          <em className="not-italic font-bold">ロケハン</em> が
          <br />
          出来る時代。
        </h1>

        <p className="mt-10 max-w-[44ch] text-[15px] text-muted leading-[1.9]">
          スタジオ・倉庫・住宅・屋外ロケ地を
          <br />
          3D で取り込み、ブラウザだけで構図・レンズ・光・人の流れを
          <br />
          撮影前に検証できる オンライン・ロケハンプラットフォーム。
        </p>

        <div className="mt-12 flex flex-wrap gap-3 justify-center">
          <Link
            href="/properties"
            className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            物件カタログを見る →
          </Link>
          <Link
            href="/pricing"
            className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-line text-ink hover:border-ink transition"
          >
            料金プラン
          </Link>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 mono text-[10px] tracking-[0.3em] uppercase opacity-40">
          ▼ SCROLL
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="frame py-28 border-t border-line">
        <div className="chapter-rule">
          <span className="opacity-60">01</span>
          <span>What Locahun3D Online does</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>

        <div className="grid md:grid-cols-3 gap-12">
          {[
            {
              n: "01",
              h: "プロの現場の為の設計",
              p: "3D データ上で計測・検証・カメラワーク検討ができ、配電盤画像、コンセント電圧、図面ダウンロードまで揃う、プロのためのツール。",
            },
            {
              n: "02",
              h: "監督・カメラマン・美術が同じ画を見る",
              p: "サブスクメンバー全員が同じ 3D 空間に入り、レンズ画角・光・人の動線を検証。意思決定が打合せ前に揃います。",
            },
            {
              n: "03",
              h: "スタジオ検索 + 測定＋構図探しのオンライン化",
              p: "条件で物件を絞り込み、即見学（3DGS）・即見積もり。現地をゲームのように検証し、撮影業界に持ち込みます。",
            },
          ].map((it) => (
            <div key={it.n} className="pt-7 border-t border-line">
              <div className="mono text-[11px] tracking-[0.3em] opacity-50 mb-4">
                {it.n}
              </div>
              <h3 className="serif text-[1.5rem] leading-[1.5] mb-3">{it.h}</h3>
              <p className="text-[14px] leading-[1.85] text-muted">{it.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* LATEST PROPERTIES — sorted by updatedAt desc */}
      <section className="frame py-24 border-t border-line">
        <div className="chapter-rule">
          <span className="opacity-60">02</span>
          <span>Latest Locations</span>
          <span className="flex-1 h-px bg-current opacity-25" />
          <span className="opacity-60">新着 {latest.length} 件</span>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {latest.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/properties"
            className="inline-block mono text-[12px] tracking-[0.28em] uppercase pb-1 border-b border-line hover:border-accent hover:text-accent transition"
          >
            すべての物件を見る ({all.length}件) →
          </Link>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="frame py-24 border-t border-line">
        <div className="chapter-rule">
          <span className="opacity-60">03</span>
          <span>Browse by category</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line">
          {(Object.keys(CATEGORY_LABEL) as PropertyCategory[]).map((cat) => (
            <Link
              key={cat}
              href={`/properties?category=${cat}`}
              className="group bg-bg p-8 flex flex-col gap-3 hover:bg-[#0a0a0a] transition"
            >
              <div className="mono text-[10px] tracking-[0.3em] uppercase opacity-50">
                {cat}
              </div>
              <div className="serif text-xl group-hover:text-accent transition">
                {CATEGORY_LABEL[cat]}
              </div>
              <div className="mono text-[10px] opacity-40 mt-auto pt-4">
                {all.filter((p) => p.category === cat).length} 件
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="frame py-32 border-t border-line text-center">
        <div className="serif text-[clamp(1.6rem,3.2vw,2.6rem)] leading-[1.6] max-w-[28ch] mx-auto">
          下見の往復を、ブラウザ <em className="not-italic text-accent">1 枚</em> に畳む。
        </div>
        <p className="mt-8 text-[14px] text-muted leading-[2] max-w-[36ch] mx-auto">
          空気、感覚、記憶、アイデア。
          <br />
          現地の時間を、<em className="not-italic text-ink">クリエイティブの拡張</em>のみに充てる。
          <br />
          ノイズを省き、<em className="not-italic text-accent">一歩先の挑戦</em>に寄り添う。
        </p>
        <div className="mt-10 flex justify-center gap-3 flex-wrap">
          <Link
            href="/sign-up"
            className="px-7 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            アカウント作成
          </Link>
          <Link
            href="/pricing"
            className="px-7 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-line hover:border-ink transition"
          >
            料金を確認
          </Link>
        </div>
      </section>
    </>
  );
}
