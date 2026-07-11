import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = {
  title: "サービスについて",
  description:
    "ロケハン3D は「スキャン」と「オンライン」の2つで成り立つサービスです。現場を3Dスキャンし、ブラウザだけで歩いて下見・購入できます。",
};

const SCAN_URL = "https://web.locahun3d.com/";
const DEMO_URL = "https://viewer.locahun3d.com/Locahun3D_OfflineViewer?demo=1";

export default async function AboutPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  return (
    <div>
      {/* ══════════════════════════════════════════════════
       *  HERO — 黒×アンバー（サイト全体の既定＝スキャン側の識別色）
       * ══════════════════════════════════════════════════ */}
      <section className="frame pt-16 pb-14">
        <header className="text-center max-w-[64ch] mx-auto">
          <div className="mono text-[10px] tracking-[0.4em] uppercase text-accent mb-4">
            LOCAHUN 3D
          </div>
          <h1 className="serif text-[clamp(2.1rem,4.4vw,3.6rem)] font-bold leading-[1.3] mb-6">
            {en ? (
              <>
                Bring the location home —<br className="hidden sm:block" />
                in full 3D.
              </>
            ) : (
              <>
                現場を、まるごと持ち帰る。
                <br className="hidden sm:block" />
                ブラウザで歩ける、3Dロケハン。
              </>
            )}
          </h1>
          <p className="text-[14px] text-muted leading-[1.95]">
            {en ? (
              <>
                Locahun3D is made of two connected steps.{" "}
                <strong className="text-accent font-bold">Scan</strong> —
                we digitize a real location with a walking 3D scan.{" "}
                <strong className="text-accent font-bold">Online</strong> —
                you browse, walk through, and download that location
                from any browser, no visit required. This page explains
                both, in detail.
              </>
            ) : (
              <>
                ロケハン3Dは、
                <strong className="text-accent font-bold">スキャン</strong>
                （現場を3D化する）と
                <strong className="text-accent font-bold">オンライン</strong>
                （ブラウザで歩いて下見・購入する）の2ステップで成り立っています。
                現地に行かなくても、実寸のロケーションをそのまま確認できます。
                このページでは、両方の中身を細かく説明します。
              </>
            )}
          </p>
        </header>
      </section>

      {/* ══════════════════════════════════════════════════
       *  01 — SCAN（黒×アンバー = マーケサイト web.locahun3d.com と同一識別色）
       * ══════════════════════════════════════════════════ */}
      <section className="border-t border-line/40">
        <div className="frame py-20">
          <div className="chapter-rule justify-center">
            <span className="opacity-60">01</span>
            <span>{en ? "Scan" : "スキャン"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>

          <div className="max-w-[68ch] mx-auto text-center mb-14">
            <h2 className="serif text-[clamp(1.7rem,3.2vw,2.4rem)] font-bold leading-[1.45] mb-5">
              {en ? (
                <>Walk through it once. Capture it for good.</>
              ) : (
                <>一度歩けば、その場所はもう手元にある。</>
              )}
            </h2>
            <p className="text-[13.5px] text-muted leading-[1.95]">
              {en ? (
                <>
                  We scan a real location — a studio, a street, a
                  building — with a handheld 3D scanning rig
                  (<span className="text-accent">PortalCam</span>). A
                  single walkthrough takes about 20 minutes. The result
                  is a 3D Gaussian Splatting (3DGS) capture: not a 3D
                  model built from scratch, but the real surfaces,
                  textures and lighting of that exact place, reconstructed
                  from real scan data.
                </>
              ) : (
                <>
                  スタジオ・街並み・建物などの実在するロケーションを、専用の
                  3Dスキャン機材「<span className="text-accent">PortalCam</span>」
                  で撮影します。歩行スキャンの所要時間は1件あたり約20分。
                  出来上がるのは、CGで一から作ったモデルではなく、実際の壁・床・
                  照明の質感をそのまま再構成した「3D Gaussian Splatting（3DGS）」
                  データです。
                </>
              )}
            </p>
          </div>

          {/* Process detail cards */}
          <div className="grid sm:grid-cols-3 gap-5 max-w-[900px] mx-auto mb-16">
            {[
              {
                n: "①",
                h: en ? "Walking scan" : "歩行スキャン",
                p: en
                  ? "PortalCam captures LiDAR + photogrammetry data while walking through the space — about 20 minutes per location."
                  : "PortalCamでLiDAR＋フォトグラメトリを取得しながら現場を歩くだけ。所要時間は1件あたり約20分。",
              },
              {
                n: "②",
                h: en ? "3DGS reconstruction" : "3DGS化",
                p: en
                  ? "The raw scan is reconstructed into a 3D Gaussian Splatting capture — real geometry, real texture, real light."
                  : "取得データを3D Gaussian Splattingとして再構成。実寸のジオメトリ・質感・光をそのまま再現します。",
              },
              {
                n: "③",
                h: en ? "Published online" : "オンライン公開",
                p: en
                  ? "The finished capture is published to the catalog, ready to walk through or download from a browser."
                  : "完成したデータはカタログに掲載され、ブラウザから歩いて下見・ダウンロードできる状態になります。",
              },
            ].map((s) => (
              <div key={s.n} className="border border-line/60 px-5 py-6 text-center">
                <div className="mono text-[20px] text-accent mb-2">{s.n}</div>
                <h3 className="text-[14px] font-bold mb-2">{s.h}</h3>
                <p className="text-[12px] text-muted leading-[1.85]">{s.p}</p>
              </div>
            ))}
          </div>

          {/* Audience: two paths */}
          <div className="grid md:grid-cols-2 gap-5 max-w-[900px] mx-auto mb-14">
            <div className="border border-accent/40 px-6 py-7">
              <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-3">
                {en ? "Location / studio owners" : "スタジオ・ロケ地オーナー様"}
              </div>
              <p className="text-[13px] text-muted leading-[1.9] mb-5">
                {en ? (
                  <>
                    Have your space scanned and listed on the online
                    catalog, so production companies can find and
                    virtually scout it before ever visiting.
                  </>
                ) : (
                  <>
                    ご自身のスタジオ・ロケ地を3Dスキャンし、オンラインカタログに
                    掲載しませんか。制作会社が来訪前にブラウザで下見できるように
                    なります。
                  </>
                )}
              </p>
              <Link
                href={lh("/contact/listing")}
                className="inline-block mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
              >
                {en ? "Request listing →" : "掲載を依頼する →"}
              </Link>
            </div>
            <div className="border border-line/60 px-6 py-7">
              <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted mb-3">
                {en ? "Production companies" : "制作会社・クリエイター様"}
              </div>
              <p className="text-[13px] text-muted leading-[1.9] mb-5">
                {en ? (
                  <>
                    Looking for a specific type of location that isn&apos;t
                    in the catalog yet? Tell us the area and the kind of
                    space, and we&apos;ll consider it for a future scan.
                  </>
                ) : (
                  <>
                    「このエリアで、こんな物件を3Dで見たい」というリクエストを
                    受け付けています。今後のスキャン対象の選定に活用します。
                  </>
                )}
              </p>
              <Link
                href={lh("/contact/request")}
                className="inline-block mono text-[11px] tracking-[0.2em] uppercase border border-line px-4 py-2 hover:border-ink transition"
              >
                {en ? "Request a location →" : "ほしい物件をリクエスト →"}
              </Link>
            </div>
          </div>

          <div className="text-center">
            <a
              href={SCAN_URL}
              target="_blank"
              rel="noopener"
              className="mono text-[11px] tracking-[0.22em] uppercase text-accent hover:underline"
            >
              {en ? "See the scanning service (web.locahun3d.com) →" : "スキャンサービスの詳細を見る（web.locahun3d.com）→"}
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
       *  02 — ONLINE（白×シアン = このサイト自身の識別色）
       * ══════════════════════════════════════════════════ */}
      <section className="theme-online bg-bg text-ink border-t border-line">
        <div className="frame py-20">
          <div className="chapter-rule justify-center">
            <span className="opacity-60">02</span>
            <span>{en ? "Online" : "オンライン"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>

          <div className="max-w-[68ch] mx-auto text-center mb-14">
            <h2 className="serif text-[clamp(1.7rem,3.2vw,2.4rem)] font-bold leading-[1.45] mb-5">
              {en ? (
                <>Scout it from your desk. No visit required.</>
              ) : (
                <>下見のために、現地へ行かなくていい。</>
              )}
            </h2>
            <p className="text-[13.5px] text-muted leading-[1.95]">
              {en ? (
                <>
                  Locahun3D Online is the browser platform where scanned
                  locations live. Search the catalog, walk through a
                  location in 3D exactly as scanned, read reviews from
                  people who&apos;ve already viewed it, and download the
                  real data when you need it for previz or storyboards —
                  all without leaving your desk.
                </>
              ) : (
                <>
                  ロケハン3D オンラインは、スキャンされたロケーションが
                  集まるブラウザ上のプラットフォームです。カタログで検索し、
                  実際のスキャンデータをそのまま3Dで歩いて確認し、視聴済みの
                  ユーザーによるレビューを読み、必要ならプリビズ・絵コンテ用に
                  生データをダウンロードする——これらすべてをブラウザだけで
                  完結できます。
                </>
              )}
            </p>
          </div>

          {/* Feature detail grid — 6 items */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1000px] mx-auto mb-16">
            {[
              {
                h: en ? "Catalog & map search" : "カタログ検索・地図検索",
                p: en
                  ? "Filter by area, category, studio type, price, ceiling height, power, parking. Sort by distance from any station or your current location."
                  : "エリア・カテゴリ・スタジオ種類・料金・天井高・電源・駐車場でフィルタ。任意の駅や現在地からの距離順にも並べ替えできます。",
              },
              {
                h: en ? "3DGS walkthrough" : "3DGSウォークスルー",
                p: en
                  ? "Walk the actual scanned space in your browser — mouse or touch to look around and move, exactly as captured on site."
                  : "実際にスキャンされた空間をブラウザ内でそのまま歩けます。マウス／タッチで見回し・移動でき、現場そのままの見え方を再現します。",
              },
              {
                h: en ? "Buy the raw 3D data" : "3Dデータ購入",
                p: en
                  ? "Purchase the underlying capture (PLY / RAD / OBJ, etc.) to bring into your own previz or storyboard pipeline."
                  : "元データ（PLY / RAD / OBJ 等）を購入し、自社のプリビズ・絵コンテ制作パイプラインに取り込めます。",
              },
              {
                h: en ? "Reviews & ratings" : "レビュー・評価",
                p: en
                  ? "Locations show a public ★ average from members who actually viewed the walkthrough — visible on both the catalog and the location page."
                  : "実際にウォークスルーを視聴した会員による★評価の平均が、カタログ・物件ページの両方に表示されます。",
              },
              {
                h: en ? "Bookmarks & sharing" : "ブックマーク・共有",
                p: en
                  ? "Save locations into named boards. Studio and Team plans can also publish a read-only share link for a board — handy for briefing a client or team."
                  : "物件を名前付きのボードに保存。Studio・Teamプランはボード単位の読み取り専用共有URLも発行でき、クライアントやチームへの共有に使えます。",
              },
              {
                h: en ? "Location board & inquiries" : "物件掲示板・お問い合わせ",
                p: en
                  ? "Ask the property questions on its board (posting requires a paid plan), or reach the studio directly through the inquiry form."
                  : "物件の掲示板で質問できます（書き込みは有料プランのみ）。お問い合わせフォームからスタジオへ直接連絡することもできます。",
              },
            ].map((f) => (
              <div key={f.h} className="bg-white border border-line px-5 py-6">
                <h3 className="text-[14px] font-bold mb-2">{f.h}</h3>
                <p className="text-[12px] text-muted leading-[1.85]">{f.p}</p>
              </div>
            ))}
          </div>

          {/* Plans mini-summary */}
          <div className="max-w-[900px] mx-auto mb-16">
            <div className="text-center mb-6">
              <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-2">
                {en ? "Plans" : "料金プラン"}
              </div>
              <p className="text-[13px] text-muted leading-[1.9]">
                {en ? (
                  <>
                    3DGS walkthroughs run on a token system — token cost
                    scales with location size, and you can view as many
                    as you like within your monthly budget. Four tiers:
                  </>
                ) : (
                  <>
                    3DGSウォークスルーはトークン制。スタジオの規模に応じて
                    トークン消費が変わり、月の予算内で何件でも見られます。
                    4段階のプランをご用意しています。
                  </>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { name: "Free", d: en ? "¥0 — try it" : "¥0・お試し" },
                { name: "Individual", d: en ? "For solo creators" : "個人クリエイター向け" },
                { name: "Studio", d: en ? "Small teams" : "小規模制作チーム向け" },
                { name: "Team", d: en ? "Production companies" : "プロダクション向け" },
              ].map((p) => (
                <div key={p.name} className="border border-line px-3 py-4 text-center">
                  <div className="mono text-[9px] tracking-[0.2em] uppercase text-accent mb-1">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-muted leading-[1.6]">{p.d}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noopener"
              className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase bg-accent border border-accent text-white hover:opacity-90 transition"
            >
              {en ? "▶ Walk the demo — no sign-up" : "▶ デモを歩く — 登録不要"}
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
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
       *  Closing — どちらから始めても良い（黒×アンバーに戻す）
       * ══════════════════════════════════════════════════ */}
      <section className="border-t border-line/40">
        <div className="frame py-16 text-center max-w-[60ch] mx-auto">
          <div className="chapter-rule justify-center">
            <span className="opacity-60">03</span>
            <span>{en ? "For" : "対象"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <p className="text-[13.5px] text-muted leading-[1.95] mb-8">
            {en ? (
              <>
                Locahun3D is for anyone who currently spends time and
                money physically visiting locations before deciding —
                production companies scouting for a shoot, studio owners
                who want their space seen without endless site visits,
                and creative teams who need real reference data, not
                just photos, for previz and storyboards.
              </>
            ) : (
              <>
                ロケハン3Dは、撮影前の「現地に行って確かめる」ために時間と
                交通費をかけている方全員のためのサービスです。ロケハンを行う
                制作会社様、内覧対応の手間を減らしたいスタジオ・ロケ地オーナー
                様、写真だけでなく本物の3Dデータをプリビズ・絵コンテに使いたい
                クリエイティブチーム様まで、幅広くご利用いただけます。
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href={lh("/contact")}
              className="px-6 py-3 mono text-[12px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
            >
              {en ? "Contact us →" : "お問い合わせ →"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
