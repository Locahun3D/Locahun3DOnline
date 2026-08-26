import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import LightboxImage from "@/components/about/lightbox-image";
import { ABOUT07_CSS } from "@/lib/design/about07-css";

/* ──────────────────────────────────────────────
 * トップページ（2026-08-16 置換）
 *
 * 旧トップは「スキャン / オンライン」の2分割ゲートウェイだったが、
 * 2サイト分岐を廃止しオンライン(locahun3d.com)へ一本化する方針（本人指示）に伴い、
 * マーケサイトのマニフェストページ
 *   digiroke3d_Web/locahun3d_manifesto.html（JA）
 *   digiroke3d_Web/en/locahun3d_manifesto.html（EN）
 * のコピーをそのまま移し、白青デザイン（/about で確立した 07 案）で組み直したもの。
 *
 *  - 文言は上記2ファイルからの移設のみ。新規の創作・数値の追加はしない。
 *  - マニフェスト側の映画モチーフ（黒地・レターボックス・REEL / タイムコード表記・
 *    フィルムストリップ）は視覚としては持ち込まない。コピーだけを活かす。
 *  - CSS は /about と同じ `.about07` スコープの共有 CSS（src/lib/design/about07-css.ts）。
 *    トップ固有の見た目（ヒーローの上下小見出し・マニフェストの詩行・ツールカードの
 *    見出しサイズ）だけ EXTRA_CSS で足す。
 *  - 締めは manifesto の END フレームの代わりに、サイト内の主要導線
 *    （物件を探す / デモ / サービスについて / 料金）へ着地させる CTA パネル。
 *    ボタン文言は /about の既存表現を再利用している。
 * ────────────────────────────────────────────── */

/** トップ固有の追加分（値は 07 の語彙に合わせてある）。 */
const EXTRA_CSS = `
/* ヒーロー: manifesto の h1 は「全ては / 一歩先の / クリエイティブ / のために」の
   4行構成。上下の短い行（ln-s）だけ小さく罫線付きにして、中央の2行を主役にする。 */
.about07 .hero-lines{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:.34em;
}
.about07 .hero-lines .ln-s{
  font-size:.42em;
  font-weight:400;
  letter-spacing:.28em;
  text-indent:.28em;
  line-height:1.6;
  color:var(--muted);
  display:inline-flex;
  align-items:center;
  gap:18px;
}
.about07 .hero-lines .ln-s::before,
.about07 .hero-lines .ln-s::after{
  content:'';
  width:40px;
  height:1px;
  background:currentColor;
  opacity:.45;
}
.about07 .hero-lines .ln-l{ line-height:1.25; }
.about07 .hero-lines .ln-l em{ font-style:normal; color:var(--blue); }

/* ツールカード（9枚）: .segment の見出しは 1.44rem で 9枚並べると重いので、
   このセクションだけ本文寄りのサイズへ落とす。 */
.about07 .tool-card .segment-body{ padding:22px; }
.about07 .tool-card h3{
  margin:0 0 8px;
  font-size:1.05rem;
  line-height:1.35;
  font-weight:700;
  text-wrap:balance;
}
.about07 .tool-card p{
  margin:0;
  color:var(--muted);
  font-size:13px;
  line-height:1.85;
}

/* ツール9枚は 980px 以下で 1 列に落ちると iPad 縦でページが 10,000px 超になる
   （実測 820px）。タブレット帯だけ 2 列にして縦を半分に戻す。 */
@media (min-width: 641px) and (max-width: 980px){
  .about07 .segments.tools{ grid-template-columns:repeat(2, 1fr); }
}

/* マニフェストの詩行（manifesto の FRAME 7）。黒地・明朝は持ち込まず、
   白地・中央ぞろえ・区切り罫だけで「行が意味を持つ」構成を再現する。 */
.about07 .manifesto-lines{
  max-width:34ch;
  margin:0 auto;
  text-align:center;
  font-size:clamp(1.1rem, 2.2vw, 1.6rem);
  line-height:2.1;
  letter-spacing:0;
  text-wrap:balance;
}
.about07 .manifesto-lines p{
  margin:0;
  padding:16px 0;
  position:relative;
}
.about07 .manifesto-lines p strong{ font-weight:700; color:var(--blue); }
.about07 .manifesto-lines p:not(:last-child)::after{
  content:'';
  position:absolute;
  left:50%;
  bottom:0;
  width:6em;
  height:1px;
  background:var(--line);
  transform:translateX(-50%);
}

/* 日本語の本文は文節で折る。about07 は 07 と字送りを合わせるため body の
   word-break:auto-phrase を normal に戻しているが、それだと狭い幅で
   「…をアシ / ストする。」のように語中で割れる（実測 390px）。
   トップは長い地の文が多いのでここだけ auto-phrase に戻す
   （非対応ブラウザでは従来どおり normal に落ちるだけ）。 */
.about07 .lead,
.about07 .feature p,
.about07 .segment p,
.about07 .section-head p,
.about07 .cta-panel p,
.about07 .manifesto-lines{
  word-break:auto-phrase;
}

/* THE METHOD のバナー。07 の .screen をそのまま使うと素の縦横比で
   画面の縦を大きく食うので、manifesto の .method-banner と同じ 21/9 に切る。 */
.about07 .screen.banner img{
  aspect-ratio:21 / 9;
  height:auto;
  min-height:0;
  object-fit:cover;
}
@media (max-width: 640px){
  .about07 .screen.banner img{ aspect-ratio:16 / 10; }
}

/* CTA のボタンは4つ並ぶので、パネルを縦積みにして横幅を確保する。 */
.about07 .cta-panel.stack{ grid-template-columns:1fr; }
@media (max-width: 640px){
  .about07 .manifesto-lines p{ padding:12px 0; }
  .about07 .hero-lines .ln-s::before,
  .about07 .hero-lines .ln-s::after{ width:24px; }
}
`;

export async function generateMetadata() {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "Locahun 3D",
        description:
          "Locahun 3D reinvents pre-shoot location scouting with 3D Gaussian Splatting. Bring the location home, 3D space and all, and try framing, lenses and light at your desk.",
      }
    : {
        title: "ロケハン3D",
        description:
          "ロケハン3D は 3D Gaussian Splatting で撮影前のロケハンを再発明するサービス。実空間を 3D ごと持ち帰り、机上で構図・レンズ・光を試せます。",
      };
}

type Bi = [string, string];

/** THE GAP（manifesto CH.01） */
const GAPS: Array<{ num: string; title: Bi; lines: Bi[] }> = [
  {
    num: "01 / SCOUT",
    title: ["限られた予算", "Limited budget"],
    lines: [
      ["大人数でのロケハンと、毎回のスケジュール調整。", "Large-crew scouting and constant schedule juggling."],
      ["複数回の下見と確認で削られる予算。", "Budget eaten away by repeated site visits and checks."],
      [
        "撮影する前から既に、やれることは狭まっている。",
        "Before you even shoot, your options are already narrowed.",
      ],
    ],
  },
  {
    num: "02 / SHARE",
    title: ["リソース不足がミスに繋がる", "Lack of resources leads to mistakes"],
    lines: [
      [
        "監督・撮影・美術・プロデューサー間で「どんな画になるか」を口頭やラフだけで伝えるのは限界がある。",
        "Conveying “what the shot will look like” between director, cinematographer, art and producer with only words or rough sketches has its limits.",
      ],
      ["誰かの解像度が致命的なミスに繋がる。", "One person’s gap becomes a fatal mistake."],
    ],
  },
  {
    num: "03 / TIME",
    title: ["時間の制約", "Time constraints"],
    lines: [
      [
        "本来やりたい検証 ─ 焦点距離、立ち位置、光の方向",
        "The tests you really want — focal length, blocking, the direction of light.",
      ],
      ["現場で試す時間は分単位。", "On set, the time to try them is measured in minutes."],
      ["ほとんどの可能性が試されないまま消える。", "Most of the possibilities vanish untested."],
    ],
  },
];

/** THE METHOD のツール9枚（manifesto CH.02） */
const TOOLS: Array<{ ic: string; title: Bi; lines: Bi[]; img: { src: string; alt: Bi } }> = [
  {
    ic: "01 / CAMERA",
    title: ["仮想カメラ", "Virtual camera"],
    lines: [
      ["センサー / 焦点距離 / アスペクト", "Sensor / focal length / aspect"],
      ["WB / パン・ティルト・ロール。", "WB / pan, tilt, roll."],
      ["実機と等価のレンズシミュレーション。", "Lens simulation equivalent to the real gear."],
    ],
    img: { src: "/home/camera.webp", alt: ["仮想カメラ", "Virtual camera"] },
  },
  {
    ic: "02 / FIGURE",
    title: ["フィギュア追加", "Add figure"],
    lines: [
      ["ポージング済みの人物モデルを配置。", "Place a pre-posed human model."],
      ["立ち位置と目線が決まり、", "Blocking and eyelines lock in, and"],
      ["絵コンテがその場で組み上がる。", "the storyboard builds itself on the spot."],
    ],
    img: { src: "/home/figure.webp", alt: ["フィギュア追加", "Add figure"] },
  },
  {
    ic: "03 / MULTI-CAM",
    title: ["マルチカメラ保存", "Multi-camera save"],
    lines: [
      ["複数カットごとにカメラを保存。", "Save a camera for each cut."],
      ["打ち合わせで現場のように調整し、", "Adjust as if on set during the meeting, and"],
      [
        "撮影手順・カメラ高さをデジタルで決定できる。",
        "decide shooting order and camera height digitally.",
      ],
    ],
    img: { src: "/home/multicam.webp", alt: ["マルチカメラ保存", "Multi-camera save"] },
  },
  {
    ic: "04 / ANIMATION",
    title: ["カメラアニメーション", "Camera animation"],
    lines: [
      ["保存カメラを繋いでパスを生成。", "Connect saved cameras to generate a path."],
      [
        "そのまま MP4 で書き出し、動きのある画を即確認。",
        "Export straight to MP4 and check the moving shot at once.",
      ],
    ],
    img: { src: "/home/animation.webp", alt: ["カメラアニメーション", "Camera animation"] },
  },
  {
    ic: "05 / MEASURE",
    title: ["距離測定", "Distance measurement"],
    lines: [
      ["splat 表面に正確スナップ。", "Snaps precisely to the splat surface."],
      [
        "大規模シーンでも現実通りの寸法。",
        "True-to-reality dimensions even in large scenes.",
      ],
    ],
    img: { src: "/home/measure.webp", alt: ["距離測定", "Distance measurement"] },
  },
  {
    ic: "06 / LIGHTING",
    title: ["環境ライティング", "Environmental lighting"],
    lines: [
      ["朝・昼・夕方・夜・雨。", "Morning, midday, evening, night, rain."],
      [
        "シーン全体の時間帯ごとの絵を即座に検証。",
        "Instantly test the look of the whole scene at each time of day.",
      ],
    ],
    img: { src: "/home/lighting.webp", alt: ["環境ライティング", "Environmental lighting"] },
  },
  {
    ic: "07 / GRID",
    title: ["構図グリッド", "Composition grid"],
    lines: [
      [
        "三分割・黄金・対角・AE 互換セーフ・カスタム。",
        "Rule of thirds, golden, diagonal, AE-compatible safe, custom.",
      ],
      ["複数同時オーバーレイ可。", "Multiple overlays at once."],
    ],
    img: { src: "/home/grid.webp", alt: ["構図グリッド", "Composition grid"] },
  },
  {
    ic: "08 / BURN-IN",
    title: ["FHD バーンイン", "FHD burn-in"],
    lines: [
      ["1920×1080 標準で書き出し。", "Export at 1920×1080 as standard."],
      [
        "メタ情報を画像外フレームに配置、画は損なわない。",
        "Metadata sits in the frame outside the image, leaving the shot untouched.",
      ],
    ],
    img: { src: "/home/burnin.jpg", alt: ["FHD バーンイン", "FHD burn-in"] },
  },
  {
    ic: "09 / OFFLINE",
    title: ["オフライン保存", "Offline save"],
    lines: [
      [
        "電波が届かない場所でも、Chrome、Safariで開いて現場で即、どの機種でも確認できる。",
        "Even where there’s no signal, open it in Chrome or Safari and check it on the spot, on any device.",
      ],
    ],
    img: { src: "/home/offline.webp", alt: ["オフライン保存", "Offline save"] },
  },
];

/** THE OUTCOME（manifesto CH.03） */
const OUTCOMES: Array<{ role: string; title: Bi; lines: Bi[] }> = [
  {
    role: "DIRECTOR",
    title: ["絵を、言葉ではなく画で渡せる", "Hand over the shot as an image, not words"],
    lines: [
      [
        "カット割り・構図・カメラ位置を、撮影前にスタッフ全員と同じ画で共有。",
        "Share shot breakdown, composition and camera position with the whole crew in the same image before the shoot.",
      ],
      [
        "指示の解像度が上がり、撮影本番に「想定外の画」が減る。",
        "Direction gets sharper, and “unexpected shots” on the day go down.",
      ],
    ],
  },
  {
    role: "D.O.P.",
    title: ["レンズ選びが、机の上で終わる", "Lens choice is settled at the desk"],
    lines: [
      [
        "14 / 24 / 35 / 50 / 85mm — 現場で全部試す時間はない。",
        "14 / 24 / 35 / 50 / 85mm — there’s no time to try them all on set.",
      ],
      [
        "ロケハン3Dで先に絞り込み、当日は撮影に集中。",
        "Narrow them down first with Locahun 3D, and focus on shooting on the day.",
      ],
    ],
  },
  {
    role: "PRODUCER",
    title: ["提案資料が現場とつながる", "Pitch decks that connect to the set"],
    lines: [
      [
        "クライアントへのピッチ、香盤の根拠、ロケハン報告 —",
        "Client pitches, the rationale behind the call sheet, scout reports —",
      ],
      [
        "メタ付き JPEG が、説明より早く、議論より強い。",
        "metadata-stamped JPEGs are faster than explaining, stronger than arguing.",
      ],
    ],
  },
  {
    role: "A. D.",
    title: ["ロケハンが、繰り返せる作業になる", "Scouting becomes a repeatable task"],
    lines: [
      [
        "過去ショットの JPEG をドロップすれば同じ場所に戻れる。",
        "Drop a JPEG from a past shot and return to the same spot.",
      ],
      ["引き継ぎも、リテイクも、続編も、迷わない。", "Handoffs, retakes, sequels — never lost again."],
    ],
  },
];

export default async function HomePage() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = (v: Bi) => v[en ? 1 : 0];
  const lh = (href: string) => localizedHref(href, locale);

  return (
    // theme-online は色目的ではなく globals.css の
    // `main:has(> .theme-online) + footer { margin-top:0 }` を効かせるため（/about と同じ）。
    <div className="about07 theme-online">
      <style dangerouslySetInnerHTML={{ __html: ABOUT07_CSS + EXTRA_CSS }} />

      {/* ── HERO（manifesto FRAME 1） ── */}
      <section className="hero">
        <div className="wrap">
          <div className="chapter-rule">
            {/* manifesto の colophon「LOCAHUN 3D — LOCATION SCOUT」から。
                JA でブランド名を2度並べると重複して見えるので両ロケール共通の英字表記。 */}
            <span className="opacity-60">LOCAHUN 3D</span>
            <span>Location scout</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="center">
            <h1 className="hero-lines">
              {en ? (
                <>
                  <span className="ln-s">All for</span>
                  <span className="ln-l">
                    <em>creativity</em>
                  </span>
                  <span className="ln-l">one step ahead</span>
                  <span className="ln-s">and beyond</span>
                </>
              ) : (
                <>
                  <span className="ln-s">全ては</span>
                  <span className="ln-l">一歩先の</span>
                  <span className="ln-l">
                    <em>クリエイティブ</em>
                  </span>
                  <span className="ln-s">のために</span>
                </>
              )}
            </h1>
            <p className="lead">
              {en
                ? "Raise the precision of your shoot prep, and support the ideas and creation of that “one step further” you couldn’t reach before."
                : "撮影準備の精度を高め、届かなかった“一歩先”の発想と創造をアシストする。"}
            </p>
          </div>
        </div>
      </section>

      {/* ── CH.01 THE GAP（manifesto FRAME 2） ── */}
      <section>
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">CH. 01</span>
            <span>{en ? "The Gap — the step that fell short" : "The Gap — 届かなかった一歩"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="section-head solo">
            <h2 className="section-title">
              {en ? (
                <>
                  <em className="not-italic text-accent">An expression that almost never came to be</em> was
                  left behind on set after the shoot was over.
                </>
              ) : (
                <>
                  <em className="not-italic text-accent">
                    <span className="w">あと一歩で</span>
                    <span className="w">生まれなかった</span>
                    <span className="w">表現</span>
                  </em>
                  <span className="w">が、</span>
                  <span className="pc-break">
                    <br />
                  </span>
                  <span className="w">撮影後の</span>
                  <span className="w">現場には</span>
                  <span className="w">残されていました。</span>
                </>
              )}
            </h2>
          </div>
          <div className="segments">
            {GAPS.map((g) => (
              <article className="feature" key={g.num}>
                <span className="role">
                  <span className="role-dot" />
                  {g.num}
                </span>
                <h3>{t(g.title)}</h3>
                <p>
                  {g.lines.map((l, i) => (
                    <span key={l[0]}>
                      {i > 0 ? " " : null}
                      {t(l)}
                    </span>
                  ))}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CH.02 THE METHOD（manifesto FRAME 4） ── */}
      <section className="soft">
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">CH. 02</span>
            <span>{en ? "The Method — reinventing shoot prep" : "The Method — 撮影準備の再発明"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="section-head">
            <h2 className="section-title">
              {en ? (
                <>
                  Bring the location home, <em className="not-italic text-accent">3D space and all</em>.
                </>
              ) : (
                <>
                  <span className="w">ロケ地を、</span>
                  <em className="not-italic text-accent">
                    <span className="w">3D空間ごと</span>
                  </em>
                  <span className="w">持ち帰る。</span>
                </>
              )}
            </h2>
            <p>
              {en
                ? "A 3DGS capture service & an offline-capable digital web application"
                : "3DGS 撮影サービス & オフライン環境対応のデジタル Web アプリケーション提供"}
            </p>
          </div>
          <div className="screen banner">
            {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
            <LightboxImage
              src="/demo-pcloud.webp"
              alt={
                en
                  ? "Bring the location home, 3D space and all"
                  : "ロケ地を 3D 空間ごと持ち帰る"
              }
            />
          </div>
          <div className="segments tools" style={{ marginTop: 20 }}>
            {TOOLS.map((tool) => (
              <article className="segment tool-card" key={tool.ic}>
                {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
                <LightboxImage src={tool.img.src} alt={t(tool.img.alt)} />
                <div className="segment-body">
                  <span className="role">
                    <span className="role-dot" />
                    {tool.ic}
                  </span>
                  <h3>{t(tool.title)}</h3>
                  <p>
                    {tool.lines.map((l, i) => (
                      <span key={l[0]}>
                        {i > 0 ? " " : null}
                        {t(l)}
                      </span>
                    ))}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CH.03 THE OUTCOME（manifesto FRAME 6） ── */}
      <section>
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">CH. 03</span>
            <span>{en ? "The Outcome — what happens on set" : "The Outcome — 現場で起こること"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="section-head solo">
            <h2 className="section-title">
              {en ? (
                <>
                  Try out your framing checks <em className="not-italic text-accent">digitally</em>
                </>
              ) : (
                <>
                  <span className="w">画角チェックを</span>
                  <em className="not-italic text-accent">
                    <span className="w">デジタル</span>
                  </em>
                  <span className="w">で試行する</span>
                </>
              )}
            </h2>
          </div>
          <div className="feature-list">
            {OUTCOMES.map((o) => (
              <article className="feature" key={o.role}>
                <span className="role">
                  <span className="role-dot" />
                  {o.role}
                </span>
                <h3>{t(o.title)}</h3>
                <p>
                  {o.lines.map((l, i) => (
                    <span key={l[0]}>
                      {i > 0 ? " " : null}
                      {t(l)}
                    </span>
                  ))}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── EPILOGUE（manifesto FRAME 7） ── */}
      <section className="soft">
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">EPILOGUE</span>
            <span>{en ? "Manifesto" : "マニフェスト"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="manifesto-lines">
            {en ? (
              <>
                <p>
                  Preparation is the <strong>fuel</strong> of creation.
                </p>
                <p>
                  Beyond the step
                  <br />
                  that fell <strong>short</strong>.
                </p>
                <p>
                  All for breakthrough,
                  <br />
                  <strong>creativity that matters</strong>.
                </p>
              </>
            ) : (
              <>
                <p>
                  準備は、創造の<strong>燃料</strong>だ。
                </p>
                <p>
                  届かなかった一歩の、
                  <br />
                  その<strong>先へ</strong>。
                </p>
                <p>
                  全ては、突き抜けた、
                  <br />
                  <strong>価値のあるクリエイティブ</strong>のために。
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 主要導線（manifesto の END フレームに代わる着地。文言は /about から流用） ── */}
      <section>
        <div className="wrap cta-panel stack">
          <div>
            <h2>
              {en ? (
                <>Take the next step, whichever side you&apos;re on.</>
              ) : (
                <>
                  <span className="w">立場に</span>
                  <span className="w">合わせて、</span>
                  <span className="w">次の</span>
                  <span className="w">一歩へ。</span>
                </>
              )}
            </h2>
            <p>
              {en
                ? "Four plans: Free / Individual / Studio / Team. Walkthrough viewing is token-based, and annual billing saves 20%. The demo requires no sign-up."
                : "プランは Free / Individual / Studio / Team の 4 段階。ウォークスルーの視聴はトークン制で、年払いは -20% です。デモは登録不要で視聴できます。"}
            </p>
          </div>
          <div className="segment-actions">
            <Link className="btn" href={lh("/properties")}>
              {en ? "Browse the catalog →" : "物件を探す →"}
            </Link>
            <Link className="btn" href={lh("/demo")}>
              {en ? "▶ Try the demo — no sign-up" : "▶ デモを歩く — 登録不要"}
            </Link>
            <Link className="btn" href={lh("/about")}>
              {en ? "About" : "サービスについて"}
            </Link>
            <Link className="btn" href={lh("/pricing")}>
              {en ? "See pricing" : "料金プランを見る"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
