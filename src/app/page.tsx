import { Fragment } from "react";
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

/* サービスについて（#service）— ナビ「サービスについて」と /about からの
   リダイレクトの着地点。sticky ヘッダー（実 56px）の下に見出しが隠れないよう
   scroll-margin を取る。
   ⚠ .about07 は zoom:calc(1/var(--z)) が掛かっているので、この中の CSS px は
      1/--z 倍で描画される。実 56px にするには 56 * --z を指定する
      （--z を素の 56px で書くと 0.7 の帯で 80px ぶんズレる）。 */
   実測: 1440px で 56px 指定だとセクション上端がヘッダー下端より 11px 上に来た
   （zoom と丸めの分）ので 72px にしてある。 */
.about07 #service{ scroll-margin-top:calc(72px * var(--z, 1)); }
/* 旧 /about のヒーローは h1（margin:18px 0 14px）だった。トップでは h2 に
   落としたので、.section-title の margin:0 のままだと chapter-rule とリード文に
   貼り付く。旧ページと同じ間隔を明示で戻す。 */
.about07 .center h2.section-title{ margin:18px 0 14px; }

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

/* ──────────────────────────────────────────────
 * ここから下は 2026-08-16 に /about から移設した「サービスについて」節
 * （本人指示: /about を独立ページとしてやめ、トップ内の見出しへ昇格）。
 * 文言・画像・リンクは /about のものをそのまま。CSS も共有の ABOUT07_CSS。
 * ────────────────────────────────────────────── */
const SCAN_URL = "https://web.locahun3d.com/";
const DEMO_URL = "https://viewer.locahun3d.com/Locahun3D_OfflineViewer?demo=1";

/** 立場別セグメント（/about の SEGMENTS） */
const SERVICE_SEGMENTS: Array<{
  key: string;
  role: Bi;
  title: Bi[];
  desc: Bi;
  img: { src: string; alt: Bi };
  points: Bi[];
  actions: Array<{ href: string; text: Bi; external?: boolean; primary?: boolean }>;
}> = [
  {
    key: "demand",
    role: ["需要側", "Demand side"],
    title: [
      ["制作会社・", "Production"],
      ["クリエイター", "& creators"],
    ],
    desc: [
      "カタログと地図で候補地を絞り込み、ブラウザで歩いて下見できます。",
      "Narrow down candidates on the catalog and map, then walk them in your browser.",
    ],
    img: {
      src: "/about/search-filters.webp",
      alt: ["カタログの検索フィルタ画面", "The catalog's search filters"],
    },
    points: [
      ["カタログ・地図で候補を検索", "Search the catalog & map"],
      ["ブラウザで歩いて下見", "Walk through in the browser"],
      ["掲示板で現地の情報を確認", "Check the board for local notes"],
      ["現地確認は本命だけ", "Visit only the finalists"],
    ],
    actions: [
      { href: "/properties", text: ["物件を探す →", "Browse the catalog →"], primary: true },
      { href: DEMO_URL, text: ["デモを歩く", "Try the demo"], external: true },
    ],
  },
  {
    key: "supply",
    role: ["供給側", "Supply side"],
    title: [
      ["スタジオ・", "Studio &"],
      ["ロケ地オーナー", "location owners"],
    ],
    desc: [
      "約 20 分のスキャン 1 回で掲載でき、問い合わせは直接届きます。",
      "One ~20-minute scan gets you listed, and inquiries reach you directly.",
    ],
    img: {
      src: "/about/portalcam.webp",
      alt: ["3Dスキャン機材 PortalCam", "PortalCam 3D scanning rig"],
    },
    points: [
      ["約 20 分のスキャン 1 回で掲載", "One ~20-min scan to get listed"],
      ["内覧対応を削減", "Fewer walk-in viewings"],
      ["問い合わせが直接届く", "Inquiries reach you directly"],
      [
        "現在キャンペーンで掲載無料（2026年12月31日まで）",
        "Free during our launch campaign (through Dec 31, 2026)",
      ],
    ],
    actions: [
      { href: "/contact/listing", text: ["掲載を依頼する →", "Request a listing →"], primary: true },
      { href: DEMO_URL, text: ["デモを歩く", "Try the demo"], external: true },
    ],
  },
  {
    key: "previz",
    role: ["需要側", "Demand side"],
    title: [
      ["プリビズ・", "Previz &"],
      ["VFX チーム", "VFX teams"],
    ],
    desc: [
      "実寸の 3D データを購入して、カメラ設計や絵コンテにそのまま使えます。",
      "Buy the true-to-scale 3D data and use it directly for camera planning and boards.",
    ],
    img: {
      src: "/about/ue-pipeline.webp",
      alt: [
        "購入した3DGSデータをUnreal Engineに取り込んでカメラワークを組んでいる画面",
        "Purchased 3DGS data imported into Unreal Engine for camera work",
      ],
    },
    points: [
      ["PLY / RAD / OBJ を購入", "Buy PLY / RAD / OBJ data"],
      ["実寸データでカメラ設計", "True-to-scale camera planning"],
      ["絵コンテに実背景を使用", "Real backgrounds for boards"],
      ["購入は各物件ページから", "Purchase from property pages"],
    ],
    actions: [
      { href: "/properties", text: ["物件を見る →", "Find a location →"], primary: true },
      { href: "/contact/license", text: ["活用について相談する", "Ask about use cases"] },
    ],
  },
];

/** 中核技術（/about の CORE） */
const CORE: Array<{ title: Bi; desc: Bi }> = [
  {
    title: ["ブラウザだけで閲覧できる", "Runs in the browser alone"],
    desc: [
      "アプリのインストールは不要。ドラッグで見回し、WASD／タッチで移動できます。",
      "No app install needed. Drag to look around, WASD / touch to move.",
    ],
  },
  {
    title: ["実寸での距離測定", "Measure at true scale"],
    desc: [
      "ビューア内で 2 点間の距離を測れます。CG ではなく実寸・実際の質感を記録しているためです。",
      "Measure point-to-point distances in the viewer — it records real dimensions and textures, not CG.",
    ],
  },
  {
    title: ["カメラツールで構図を検討", "Frame shots with camera tools"],
    desc: [
      "焦点距離 14〜200mm・アスペクト比・セーフフレーム・構図グリッドを、実際の画角で確認できます。",
      "Check focal lengths of 14–200mm, aspect ratios, safe frames and composition grids at real angles of view.",
    ],
  },
];

/** 利用の流れ（/about の FLOW） */
const FLOW: Array<{ key: string; title: Bi; desc: Bi }> = [
  {
    key: "search",
    title: ["探す", "Search"],
    desc: [
      "エリア・カテゴリ・料金・天井高・面積・電源・駐車場・利用時間帯で絞り込み。駅や現在地からの距離順にも並べ替えられます。",
      "Filter by area, category, price, ceiling height, floor area, power, parking and time slots. Sort by distance from any station or your location.",
    ],
  },
  {
    key: "walk",
    title: ["歩く", "Walk"],
    desc: [
      "物件ページからそのままウォークスルー。視聴はトークン制で、Free 登録で 6 トークンが付きます。",
      "Open a walkthrough right from the property page. Viewing uses tokens — 6 are granted at Free signup.",
    ],
  },
  {
    key: "assess",
    title: ["検討する", "Assess"],
    desc: [
      "距離を実寸で測り、焦点距離 14〜200mm で構図を確認。必要なら 3D データ（PLY / RAD / OBJ）そのものを購入できます。",
      "Measure distances at true scale and frame shots at 14–200mm. Buy the 3D data itself (PLY / RAD / OBJ) when you need it.",
    ],
  },
  {
    key: "share",
    title: ["共有する", "Share"],
    desc: [
      "物件を名前付きボードに保存。Studio / Team プランは読み取り専用の共有 URL を発行できます。",
      "Save properties into named boards. Studio / Team plans can publish read-only share links.",
    ],
  },
];

/** 仕組み3ステップ（/about の STEPS） */
const STEPS: Array<{ no: string; img: { src: string; alt: Bi }; title: Bi; desc: Bi }> = [
  {
    no: "STEP 01",
    img: {
      src: "/about/portalcam.webp",
      alt: ["3Dスキャン機材 PortalCam", "PortalCam 3D scanning rig"],
    },
    title: ["歩行スキャン", "Walking scan"],
    desc: [
      "専用機材 PortalCam で現場を歩いて撮影します。所要時間は 1 件あたり約 20 分。",
      "We capture the space by walking through it with PortalCam. About 20 minutes per location.",
    ],
  },
  {
    no: "STEP 02",
    img: {
      src: "/demo-pcloud.webp",
      alt: [
        "実写に3DGSの生ポイントクラウドを重ねた比較画像",
        "Photo blended with raw 3DGS point cloud data",
      ],
    },
    title: ["3DGS 化", "3DGS reconstruction"],
    desc: [
      "撮影データを 3D Gaussian Splatting として再構成。CG モデリングではなく、実寸・実際の質感・照明をそのまま記録します。",
      "The capture is reconstructed as 3D Gaussian Splatting — not CG modeling, but the real dimensions, textures and lighting as-is.",
    ],
  },
  {
    no: "STEP 03",
    img: {
      src: "/about/walkthrough.webp",
      alt: [
        "公開された3DGSデータをビューアで歩いている画面",
        "Walking a published 3DGS capture in the viewer",
      ],
    },
    title: ["カタログ公開", "Published to the catalog"],
    desc: [
      "完成データをカタログに掲載。以降はいつでもブラウザで視聴・購入できます。",
      "The finished capture is listed on the catalog, viewable and purchasable from a browser at any time.",
    ],
  },
];

/** 機能の詳細9行（/about の DETAILS） */
const DETAILS: Array<{
  key: string;
  label: Bi;
  desc: Bi;
  img?: { src: string; alt: Bi };
  link?: { href: string; text: Bi };
}> = [
  {
    key: "filters",
    label: ["検索フィルタ", "Search filters"],
    desc: [
      "エリア・カテゴリ・スタジオ種類・料金・天井高・面積・収容人数・電源（200V）・駐車場・利用時間帯。駅や現在地からの距離順ソートに対応。",
      "Area, category, studio type, price, ceiling height, floor area, capacity, power (200V), parking, time slots. Distance sort from any station or your location.",
    ],
    img: {
      src: "/about/search-filters.webp",
      alt: ["カタログの検索フィルタ画面", "The catalog's search filters"],
    },
    link: { href: "/properties", text: ["物件一覧 →", "Catalog →"] },
  },
  {
    key: "walkthrough",
    label: ["ウォークスルー操作", "Walkthrough controls"],
    desc: [
      "ドラッグで見回し、WASD／タッチで移動。アプリのインストールは不要で、ブラウザだけで動きます。ビューア内では 2 点間の距離測定もできます。",
      "Drag to look around, WASD / touch to move. No app install — it runs in the browser. The viewer also measures point-to-point distances.",
    ],
    img: {
      src: "/about/measure.webp",
      alt: ["ビューアの距離測定機能で道路幅7mを計測している画面", "Measuring a 7 m road width in the viewer"],
    },
  },
  {
    key: "camtools",
    label: ["カメラツール", "Camera tools"],
    desc: [
      "焦点距離（14〜200mm）・アスペクト比・セーフフレーム・構図グリッドを設定して、実際の画角で構図を検討できます。ショット情報付きの JPEG 書き出しにも対応。",
      "Set focal length (14–200mm), aspect ratio, safe frames and composition grids to explore framing at real focal lengths. Exports JPEGs with shot metadata.",
    ],
    img: {
      src: "/about/camtools.webp",
      alt: [
        "ビューアのカメラツールでレンズ・アスペクト・セーフフレームを設定している画面",
        "Configuring lens, aspect and safe frames with the viewer's camera tools",
      ],
    },
  },
  {
    key: "tokens",
    label: ["視聴トークン", "Viewing tokens"],
    desc: [
      "Free 登録で 6 トークン、有料プランは月 16〜120 トークンを付与。シーンのアンロック消費は初回のみで、以降 1 年間は同じシーンを無償で再視聴できます。",
      "6 tokens at Free signup; paid plans grant 16–60 per month. Unlocking a scene costs tokens once — revisits are free for 1 year.",
    ],
    img: {
      src: "/about/tokens.webp",
      alt: ["マイページのトークン残高表示", "Token balance on the account page"],
    },
    link: { href: "/pricing", text: ["料金プラン →", "Pricing →"] },
  },
  {
    key: "formats",
    label: ["購入データ形式", "Purchase formats"],
    desc: [
      "PLY / OBJ の実寸データ。Unreal Engine などのプリビズ・VFX パイプラインへ取り込み、カメラ設計や絵コンテの背景にそのまま使えます。",
      "True-to-scale PLY / OBJ. Import into previz / VFX pipelines like Unreal Engine for camera planning and storyboard backgrounds.",
    ],
    img: {
      src: "/about/ue-pipeline.webp",
      alt: [
        "購入した3DGSデータをUnreal Engineに取り込んでカメラワークを組んでいる画面",
        "Purchased 3DGS data imported into Unreal Engine for camera work",
      ],
    },
  },
  {
    key: "boards",
    label: ["ブックマーク共有", "Board sharing"],
    desc: [
      "候補物件を名前付きボードに整理。Studio / Team プランはボード単位の読み取り専用共有 URL を発行できます。",
      "Organize candidates into named boards. Studio / Team plans can publish read-only share links per board.",
    ],
    img: {
      src: "/about/board-share.webp",
      alt: ["保存ボードと共有URL発行の画面", "Boards with a read-only share link"],
    },
  },
  {
    key: "inquiries",
    label: ["掲示板・問い合わせ", "Board & inquiries"],
    desc: [
      "物件掲示板の閲覧は全員可、書き込みは有料プラン。問い合わせフォームの内容は掲載スタジオへ直接届きます。",
      "Property boards are readable by everyone; posting requires a paid plan. Inquiry form messages reach the listing studio directly.",
    ],
    img: {
      src: "/about/board.webp",
      alt: ["物件ページの掲示板", "The property board"],
    },
  },
  {
    key: "invoices",
    label: ["請求書", "Invoices"],
    desc: [
      "有料プランは毎月の請求書を自動送付（電子帳簿保存法・インボイス制度対応）。登録番号（T番号）は申込時に入力でき、請求書へ自動反映されます。",
      "Paid plans auto-send monthly invoices (compliant with Japan's e-bookkeeping and invoice systems). Your registration (T) number is applied automatically.",
    ],
    img: {
      src: "/about/invoice.webp",
      alt: ["自動送付される領収書・請求書の書式", "The auto-sent receipt / invoice format"],
    },
  },
  {
    key: "ai",
    label: ["AI・産業活用", "AI & industrial use"],
    desc: [
      "AIモデルの学習データ、工場・商業施設のデジタルツイン、防災・研修シミュレーションなど、プリビズ以外の産業活用にもご利用いただけます。AI学習目的の利用は事前のご相談・個別合意が必要ですが、当社としても前向きに取り組みたい分野です。まずはお気軽にお問い合わせください。",
      "The data also supports uses beyond previz — AI model training sets, digital twins for factories and commercial facilities, and disaster-prevention or training simulations. AI-training use needs prior consultation and a separate agreement, but it's an area we're genuinely excited about — reach out and let's talk.",
    ],
    link: { href: "/contact/license", text: ["活用について相談する →", "Ask about use cases →"] },
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

      {/* ══ サービスについて（旧 /about・2026-08-16 にトップへ統合） ══
          ナビ「サービスについて」はこの #service へ飛ぶ。/about・/en/about は
          このアンカーへの恒久リダイレクト（src/app/about/page.tsx）。
          ⚠ 中身は /about の並び（立場別3枚 → 中核技術 → 4列フロー → 仕組み3ステップ
             → 機能の詳細9行）をそのまま移設。文言・画像・リンクは変えていない。
             旧ページの h1 はトップの h1（マニフェスト）と重複するので h2 に落とし、
             見出し帯は他セクションと同じ chapter-rule に統一した。 */}
      <section id="service">
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">ABOUT</span>
            <span>{en ? "Service" : "サービスについて"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="center">
            <h2 className="section-title">
              {en ? (
                <>
                  Real locations,
                  <span className="pc-break">
                    <br />
                  </span>{" "}
                  scouted <em className="not-italic text-accent">in your browser</em>.
                </>
              ) : (
                <>
                  <span className="w">実在の</span>
                  <span className="w">ロケ地を、</span>
                  <span className="pc-break">
                    <br />
                  </span>
                  <em className="not-italic text-accent">
                    <span className="w">ブラウザで</span>
                    <span className="w">歩いて</span>
                  </em>
                  <span className="w">下見。</span>
                </>
              )}
            </h2>
            <p className="lead">
              {en
                ? "Locahun3D scans real locations into 3DGS (3D Gaussian Splatting) data and lists them on this catalog. You can check a space's size, ceiling height and lighting without visiting, and buy the 3D data itself when you need it."
                : "ロケハン3D は、実在のロケ地を 3DGS（3D Gaussian Splatting）データ化してカタログに掲載しているサービスです。現地に行かなくても空間の広さ・天井高・光の入り方を確認でき、必要なら 3D データそのものを購入できます。"}
            </p>
          </div>
          <div className="segments">
            {SERVICE_SEGMENTS.map((s) => (
              <article className="segment" key={s.key}>
                {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
                <LightboxImage src={s.img.src} alt={t(s.img.alt)} />
                <div className="segment-body">
                  <span className="role">
                    <span className="role-dot" />
                    {t(s.role)}
                  </span>
                  {/* ⚠ h2 のまま（about07 CSS は `.segment h2` で寸法を決めている）。
                      h3 に落とすとカード見出しだけ別サイズになる。 */}
                  <h2>
                    {s.title.map((c, i) => (
                      <Fragment key={c[0]}>
                        {/* .w は inline-block なので EN は語間スペースを外側に置く */}
                        {en && i > 0 ? " " : null}
                        <span className="w">{t(c)}</span>
                      </Fragment>
                    ))}
                  </h2>
                  <p>{t(s.desc)}</p>
                  <ul>
                    {s.points.map((p) => (
                      <li key={p[0]}>
                        <span className="check">✓</span>
                        <span>{t(p)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="segment-actions">
                    {s.actions.map((a) =>
                      a.external ? (
                        <a
                          key={a.href + a.text[0]}
                          className={a.primary ? "btn primary" : "btn secondary"}
                          href={a.href}
                          target="_blank"
                          rel="noopener"
                        >
                          {t(a.text)}
                        </a>
                      ) : (
                        <Link
                          key={a.href + a.text[0]}
                          className={a.primary ? "btn primary" : "btn secondary"}
                          href={lh(a.href)}
                        >
                          {t(a.text)}
                        </Link>
                      )
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 中核技術（旧 /about の FEATURES） ── */}
      <section>
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">FEATURES</span>
            <span>{en ? "What you can do" : "できること"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="product">
            <div className="screen">
              {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
              <LightboxImage
                src="/about/walkthrough.webp"
                alt={
                  en
                    ? "Walking a published 3DGS capture in the viewer"
                    : "公開された3DGSデータをビューアで歩いている画面"
                }
              />
            </div>
            <div className="feature-list">
              {CORE.map((c) => (
                <article className="feature" key={c.title[0]}>
                  <h3>{t(c.title)}</h3>
                  <p>{t(c.desc)}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 利用の流れ（旧 /about の FLOW） ── */}
      <section className="soft">
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">FLOW</span>
            <span>{en ? "How you use it" : "利用の流れ"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="section-head">
            <h2 className="section-title">
              {en ? (
                <>Search, walk, assess, share.</>
              ) : (
                <>
                  <span className="w">探して、</span>
                  <span className="w">歩いて、</span>
                  <span className="w">検討して、</span>
                  <span className="w">共有する。</span>
                </>
              )}
            </h2>
            <p>
              {en
                ? "From catalog search to sharing with your team, the steps that come before a shoot can all be handled online."
                : "カタログ検索からチーム共有まで、撮影前の候補地検討に必要な流れをオンラインで進められます。"}
            </p>
          </div>
          <div className="flow">
            {FLOW.map((f) => (
              <div className="flow-item" key={f.key}>
                <strong>{t(f.title)}</strong>
                <p>{t(f.desc)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 仕組み3ステップ（旧 /about の HOW IT WORKS） ── */}
      <section>
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">HOW IT WORKS</span>
            <span>{en ? "Scan to catalog" : "仕組み"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="section-head">
            <h2 className="section-title">
              {en ? (
                <>From a 20-minute walk to a published location.</>
              ) : (
                <>
                  <span className="w">約 20 分の</span>
                  <span className="w">歩行スキャンから、</span>
                  <span className="w">カタログ</span>
                  <span className="w">公開まで。</span>
                </>
              )}
            </h2>
            <p>
              {en ? (
                <>
                  Scanning is a separate service —{" "}
                  <a href={SCAN_URL} target="_blank" rel="noopener">
                    details at web.locahun3d.com
                  </a>
                  .
                </>
              ) : (
                <>
                  スキャン自体は別サービスとして提供しています。詳細は{" "}
                  <a href={SCAN_URL} target="_blank" rel="noopener">
                    web.locahun3d.com
                  </a>{" "}
                  をご覧ください。
                </>
              )}
            </p>
          </div>
          <div className="segments">
            {STEPS.map((s) => (
              <article className="segment" key={s.no}>
                {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
                <LightboxImage src={s.img.src} alt={t(s.img.alt)} />
                <div className="segment-body">
                  <span className="role">
                    <span className="role-dot" />
                    {s.no}
                  </span>
                  <h2>
                    <span className="w">{t(s.title)}</span>
                  </h2>
                  <p>{t(s.desc)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 機能の詳細9行（旧 /about の DETAILS） ── */}
      <section className="soft">
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">DETAILS</span>
            <span>{en ? "Feature details" : "機能の詳細"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="section-head solo">
            <h2 className="section-title">{en ? "Everything, in detail." : "機能の詳細。"}</h2>
          </div>
          <div className="feature-list">
            {DETAILS.map((d) => (
              <article className={d.img ? "feature detail" : "feature"} key={d.key}>
                <div>
                  <h3>{t(d.label)}</h3>
                  <p>{t(d.desc)}</p>
                  {d.link && (
                    <Link className="detail-link" href={lh(d.link.href)}>
                      {t(d.link.text)}
                    </Link>
                  )}
                </div>
                {d.img && (
                  /* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */
                  <LightboxImage src={d.img.src} alt={t(d.img.alt)} className="detail-shot" />
                )}
              </article>
            ))}
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
            {/* ⚠ /demo は /pricing へ統合済み（2026-08-16）。デモ導線は料金ページ内。 */}
            <Link className="btn" href={lh("/pricing")}>
              {en ? "▶ Try the demo — no sign-up" : "▶ デモを歩く — 登録不要"}
            </Link>
            {/* ⚠ /about はこのページの #service へ統合済み（2026-08-16）。同一ページ内の
                アンカーなので、ボタン自体は残さず（同じ画面の上へ戻るだけで導線として
                重複する）カタログ・デモ・料金の3つに絞る。 */}
            <Link className="btn" href={lh("/pricing")}>
              {en ? "See pricing" : "料金プランを見る"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
