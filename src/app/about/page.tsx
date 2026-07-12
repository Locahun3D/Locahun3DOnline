import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = {
  title: "サービスについて",
  description:
    "ロケハン3D は、実在のロケ地を 3DGS でスキャンし、ブラウザで歩いて下見できるサービスです。できること・仕組み・対象をまとめています。",
};

const SCAN_URL = "https://web.locahun3d.com/";
const DEMO_URL = "https://viewer.locahun3d.com/Locahun3D_OfflineViewer?demo=1";

export default async function AboutPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  // できること（事実ベースの機能一覧）。コピーは機能の説明のみ、キャッチコピーは書かない。
  const FEATURES: Array<{
    no: string;
    label: [string, string];
    title: [string, string];
    desc: [string, string];
    link?: { href: string; text: [string, string]; external?: boolean };
  }> = [
    {
      no: "01",
      label: ["探す", "Search"],
      title: ["カタログ・地図で物件を探す", "Search the catalog & map"],
      desc: [
        "エリア・カテゴリ・料金・天井高・面積・電源・駐車場・利用時間帯で絞り込み。駅や現在地からの距離順にも並べ替えられます。",
        "Filter by area, category, price, ceiling height, floor area, power, parking and available time slots. Sort by distance from any station or your location.",
      ],
      link: { href: "/properties", text: ["物件を探す →", "Browse →"] },
    },
    {
      no: "02",
      label: ["歩く", "Walk"],
      title: ["ブラウザで歩いて下見する", "Walk through in your browser"],
      desc: [
        "物件ページからそのままウォークスルー。アプリ不要、マウス／タッチで移動と見回しができます。視聴はトークン制（Free 登録で 6 トークン付与）。",
        "Open a walkthrough right from the property page. No app needed — move and look around with mouse or touch. Viewing uses tokens (6 granted at Free signup).",
      ],
      link: { href: DEMO_URL, text: ["デモを歩く（登録不要）→", "Try the demo (no sign-up) →"], external: true },
    },
    {
      no: "03",
      label: ["買う", "Buy"],
      title: ["3D データを購入する", "Buy the 3D data"],
      desc: [
        "スキャン元データ（PLY / RAD / OBJ）を物件ページから購入できます。実寸データなので、プリビズ・絵コンテ・カメラ設計にそのまま使えます。",
        "Purchase the raw capture (PLY / RAD / OBJ) from the property page. The data is true to scale — usable directly for previz, storyboards and camera planning.",
      ],
    },
    {
      no: "04",
      label: ["評価", "Reviews"],
      title: ["レビューを見る・書く", "Read & write reviews"],
      desc: [
        "実際にウォークスルーを視聴した会員が ★ 評価とコメントを投稿できます。平均評価はカタログと物件ページで誰でも見られます。",
        "Members who actually viewed a walkthrough can post star ratings and comments. Averages are visible to everyone on the catalog and property pages.",
      ],
    },
    {
      no: "05",
      label: ["保存・共有", "Share"],
      title: ["ブックマークして共有する", "Bookmark & share"],
      desc: [
        "物件を名前付きボードに保存できます。Studio / Team プランはボードの読み取り専用共有 URL を発行でき、クライアントやチームへの候補共有に使えます。",
        "Save properties into named boards. Studio / Team plans can publish a read-only share link per board — handy for sharing candidates with a client or team.",
      ],
    },
    {
      no: "06",
      label: ["連絡", "Contact"],
      title: ["掲示板・問い合わせ", "Board & inquiries"],
      desc: [
        "物件ごとの掲示板は誰でも閲覧できます（書き込みは有料プラン）。問い合わせフォームからはスタジオへ直接連絡が届きます。",
        "Each property has a board anyone can read (posting requires a paid plan). The inquiry form reaches the studio directly.",
      ],
    },
  ];

  const STEPS: Array<{ no: string; title: [string, string]; desc: [string, string] }> = [
    {
      no: "STEP 01",
      title: ["歩行スキャン", "Walking scan"],
      desc: [
        "専用機材 PortalCam で現場を歩いて撮影します。所要時間は 1 件あたり約 20 分。",
        "We capture the space by walking through it with PortalCam. About 20 minutes per location.",
      ],
    },
    {
      no: "STEP 02",
      title: ["3DGS 化", "3DGS reconstruction"],
      desc: [
        "撮影データを 3D Gaussian Splatting として再構成。CG モデリングではなく、実寸・実際の質感・照明をそのまま記録します。",
        "The capture is reconstructed as 3D Gaussian Splatting — not CG modeling, but the real dimensions, textures and lighting as-is.",
      ],
    },
    {
      no: "STEP 03",
      title: ["カタログ公開", "Published to the catalog"],
      desc: [
        "完成データをカタログに掲載。以降はいつでもブラウザで視聴・購入できます。",
        "The finished capture is listed on the catalog, viewable and purchasable from a browser at any time.",
      ],
    },
  ];

  return (
    <div className="theme-online frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ABOUT</span>
        <span>Service</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="text-center mb-14">
        <h1 className="serif text-[clamp(2rem,4vw,3.6rem)] font-bold leading-[1.3] max-w-[26ch] mx-auto">
          {en ? (
            <>
              Real locations,
              <br />
              scouted <em className="not-italic text-accent">in your browser</em>.
            </>
          ) : (
            <>
              実在のロケ地を、
              <br />
              <em className="not-italic text-accent">ブラウザで歩いて</em>下見。
            </>
          )}
        </h1>
        <p className="mt-6 text-[14px] text-muted max-w-[58ch] mx-auto leading-[1.85]">
          {en ? (
            <>
              Locahun3D scans real locations into 3DGS (3D Gaussian Splatting)
              data and lists them on this catalog. You can check a space&apos;s
              size, ceiling height and lighting without visiting, and buy the 3D
              data itself when you need it.
            </>
          ) : (
            <>
              ロケハン3D は、実在のロケ地を 3DGS（3D Gaussian Splatting）データ化して
              カタログに掲載しているサービスです。現地に行かなくても空間の広さ・天井高・
              光の入り方を確認でき、必要なら 3D データそのものを購入できます。
            </>
          )}
        </p>
      </header>

      {/* できること — 事実ベースの機能一覧 */}
      <section>
        <div className="chapter-rule">
          <span className="opacity-60">FEATURES</span>
          <span>{en ? "What you can do" : "できること"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line">
          {FEATURES.map((f) => (
            <div key={f.no} className="bg-white p-6 flex flex-col">
              <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-2">
                {f.no} — {f.label[en ? 1 : 0]}
              </div>
              <h3 className="text-[14px] font-bold mb-2">{f.title[en ? 1 : 0]}</h3>
              <p className="text-[12.5px] text-muted leading-[1.85] flex-1">
                {f.desc[en ? 1 : 0]}
              </p>
              {f.link &&
                (f.link.external ? (
                  <a
                    href={f.link.href}
                    target="_blank"
                    rel="noopener"
                    className="mt-4 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
                  >
                    {f.link.text[en ? 1 : 0]}
                  </a>
                ) : (
                  <Link
                    href={lh(f.link.href)}
                    className="mt-4 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
                  >
                    {f.link.text[en ? 1 : 0]}
                  </Link>
                ))}
            </div>
          ))}
        </div>
      </section>

      {/* 仕組み — スキャンから公開まで */}
      <section className="mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">HOW IT WORKS</span>
          <span>{en ? "Scan to catalog" : "仕組み"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="grid sm:grid-cols-3 gap-px bg-line border border-line">
          {STEPS.map((s) => (
            <div key={s.no} className="bg-white p-6">
              <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-2">
                {s.no}
              </div>
              <h3 className="text-[14px] font-bold mb-2">{s.title[en ? 1 : 0]}</h3>
              <p className="text-[12.5px] text-muted leading-[1.85]">{s.desc[en ? 1 : 0]}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] text-muted">
          {en ? (
            <>
              Scanning is a separate service —{" "}
              <a href={SCAN_URL} target="_blank" rel="noopener" className="text-accent hover:underline">
                details at web.locahun3d.com
              </a>
              .
            </>
          ) : (
            <>
              スキャン自体は別サービスとして提供しています。詳細は{" "}
              <a href={SCAN_URL} target="_blank" rel="noopener" className="text-accent hover:underline">
                web.locahun3d.com
              </a>{" "}
              をご覧ください。
            </>
          )}
        </p>
      </section>

      {/* 対象別 — 誰が何に使うか */}
      <section className="mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">FOR</span>
          <span>{en ? "Who uses it" : "対象"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="grid md:grid-cols-3 gap-6 text-[12px] text-muted">
          <div className="border-t border-line pt-5">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              {en ? "Production / creators" : "制作会社・クリエイター"}
            </div>
            <p>
              {en
                ? "Narrow down candidates in the browser and visit only the finalists. Reviews and true-to-scale walkthroughs replace most site visits."
                : "候補をブラウザで絞り込み、現地確認は本命だけに。実寸のウォークスルーとレビューで、下見の往復を減らせます。"}
            </p>
            <Link
              href={lh("/properties")}
              className="inline-block mt-3 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
            >
              {en ? "Browse the catalog →" : "物件を探す →"}
            </Link>
          </div>
          <div className="border-t border-line pt-5">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              {en ? "Studio / location owners" : "スタジオ・ロケ地オーナー"}
            </div>
            <p>
              {en
                ? "One ~20-minute scan lists your space on the catalog. Fewer walk-in viewings; inquiries reach you directly. Listing uses a separate pricing scheme with revenue share on data sales."
                : "約 20 分のスキャン 1 回でカタログに掲載できます。内覧対応が減り、問い合わせは直接届きます。掲載側は別料金体系で、データ販売の収益シェアもあります。"}
            </p>
            <Link
              href={lh("/contact/listing")}
              className="inline-block mt-3 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
            >
              {en ? "Request a listing →" : "掲載を依頼する →"}
            </Link>
          </div>
          <div className="border-t border-line pt-5">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              {en ? "Previz / VFX teams" : "プリビズ・VFX チーム"}
            </div>
            <p>
              {en
                ? "Buy the raw capture in PLY / RAD / OBJ and bring the true-to-scale space into your camera planning, storyboards or VFX pipeline. Purchase from each property page."
                : "PLY / RAD / OBJ 形式の実寸データを購入して、カメラ設計・絵コンテ・VFX のパイプラインに取り込めます。購入は各物件ページから。"}
            </p>
            <Link
              href={lh("/properties")}
              className="inline-block mt-3 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
            >
              {en ? "Find a location →" : "物件を見る →"}
            </Link>
          </div>
        </div>
      </section>

      {/* 料金への導線 */}
      <section className="mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">PLANS</span>
          <span>{en ? "Pricing" : "料金"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <p className="text-[13px] text-muted max-w-[62ch] leading-[1.85]">
          {en ? (
            <>
              Four plans: Free / Individual / Studio / Team. Walkthrough viewing is
              token-based, and annual billing saves 20%. The demo requires no
              sign-up.
            </>
          ) : (
            <>
              プランは Free / Individual / Studio / Team の 4 段階。ウォークスルーの視聴は
              トークン制で、年払いは -20% です。デモは登録不要で視聴できます。
            </>
          )}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={DEMO_URL}
            target="_blank"
            rel="noopener"
            className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase bg-accent border border-accent text-white hover:opacity-90 transition"
          >
            {en ? "▶ Try the demo — no sign-up" : "▶ デモを歩く — 登録不要"}
          </a>
          <Link
            href={lh("/properties")}
            className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-white transition"
          >
            {en ? "Browse the catalog →" : "物件を探す →"}
          </Link>
          <Link
            href={lh("/pricing")}
            className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-line hover:border-ink transition"
          >
            {en ? "See pricing" : "料金プランを見る"}
          </Link>
        </div>
      </section>
    </div>
  );
}
