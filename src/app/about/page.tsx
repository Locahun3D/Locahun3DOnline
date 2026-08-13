import { Fragment } from "react";
import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import LightboxImage from "@/components/about/lightbox-image";

export async function generateMetadata() {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "About",
        description:
          "Locahun 3D scans real filming locations with 3DGS so you can walk them in a browser before the shoot. What it does, how it works, features and FAQ.",
      }
    : {
        title: "サービスについて",
        description:
          "ロケハン3D は、実在のロケ地を 3DGS でスキャンし、ブラウザで歩いて下見できるサービスです。できること・仕組み・機能の詳細・対象・よくある疑問をまとめています。",
      };
}

const SCAN_URL = "https://web.locahun3d.com/";
const DEMO_URL = "https://viewer.locahun3d.com/Locahun3D_OfflineViewer?demo=1";

/* ──────────────────────────────────────────────
 * public/_design/home/07.html の <style> をそのまま移植したページ。
 * 2026-08-14: 「トンマナに寄せる」調整を全部やめ、07 の CSS を数値ごと複製した。
 *
 *  - セレクタは 07 のまま（.wrap / .hero / .segment / .screen / .flow / .cta-panel …）。
 *    他ページに影響しないよう全部 `.about07` 配下にスコープしてある。
 *  - 07 が body に当てていたもの（font-family / line-height:1.8 / color / background:#fff）は
 *    `.about07` に当てる。加えて globals.css が body に入れている
 *    letter-spacing:0.04em / font-weight:300 / word-break:auto-phrase / text-wrap:pretty は
 *    07 には無いので `.about07` で素の値へ戻す（残すと字送りが 07 とズレる）。
 *  - 色は 07 の値をそのまま（--blue #155eef / --navy #0d2f63 等）。
 *    サイトの accent トークンには置き換えない。
 *  - ⚠ zoom: html に zoom(0.7/0.8/0.9) が掛かっているため、そのままだと同じ幅で並べても
 *    07 より 0.7〜0.9 倍で描画されて別物に見える。site-header.tsx と同じ手法で
 *    `zoom: calc(1 / var(--z))` を当てて実寸 1:1 に戻し、07.html と同一の描画にする。
 *  - Tailwind preflight が h1〜h3 の font-weight/margin を潰すので、07 の UA 既定
 *    （bold=700）を明示で復元している。
 *
 * 07 に無いセクション（仕組み3ステップ / 機能の詳細9行）は 07 の既存クラス
 * （.segments+.segment / .feature-list+.feature）を流用して組む。
 * ────────────────────────────────────────────── */

/** 07.html の <style> をそのまま `.about07` 配下へスコープしたもの。値は一切変えていない。 */
const CSS = `
/* ⚠ globals.css の html は黒地で、かつ scrollbar-gutter: stable both-edges が
   左右に 15px ずつ余白を予約している。暗いページでは黒地に黒余白なので見えないが、
   07 は白基調なので**ページの両脇に黒い帯**として露出する（実測 1440 で 15px×2）。
   このページを表示している間だけ html/body を白にして帯を消す。
   :has() なので /about 以外には一切かからない。 */
html:has(.about07),
html:has(.about07) body{ background:#fff; }
.about07{
  --ink:#101828;
  --muted:#526174;
  /* 青のトーンだけサイトのアクセントに合わせる（2026-08-14）。
     07 の汎用青 #155eef / 紺 #0d2f63 / シアン #0891b2 は使わない。 */
  --blue:var(--color-accent);
  --navy:color-mix(in srgb, var(--color-accent) 55%, black);
  --cyan:var(--color-accent);
  --line:#d8e3ef;
  --soft:#f7fafc;
  --green:#0f9f6e;
  --radius:8px;
  /* ⚠ 07と1:1に見せるため zoom を打ち消していたが、そうすると文字だけ
     他ページより大きく見える。サイト共通の zoom に乗せて倍率を揃える。 */
  margin:0;
  color:var(--ink);
  background:#fff;
  /* 書体は他ページと同じ（globals.css の --font-sans = Noto Sans JP）。 */
  font-family:var(--font-sans);
  line-height:1.8;
  font-weight:400;
  letter-spacing:normal;
  word-break:normal;
  overflow-wrap:normal;
  line-break:auto;
  text-wrap:wrap;
  -webkit-font-smoothing:auto;
}
.about07 *{ box-sizing:border-box; }
.about07 a{ color:inherit; text-decoration:none; }
.about07 img{ display:block; max-width:100%; }
/* Tailwind preflight で潰れる UA 既定（見出しの bold）を 07 と同じ 700 に戻す */
.about07 h1,.about07 h2,.about07 h3{ font-weight:700; }
.about07 .wrap{
  width:min(1160px, calc(100% - 48px));
  margin:0 auto;
}
.about07 .hero{
  padding:70px 0 78px;
  background:linear-gradient(180deg, #fff, #f5faff);
}
.about07 .center{
  text-align:center;
  max-width:850px;
  margin:0 auto 34px;
}
.about07 .eyebrow{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid color-mix(in srgb, var(--color-accent) 32%, white);
  background:color-mix(in srgb, var(--color-accent) 10%, white);
  color:var(--blue);
  font-size:13px;
  font-weight:700;
  line-height:1.4;
}
.about07 h1{
  margin:18px 0 14px;
  font-size:clamp(1.55rem, 4.5vw, 3.6rem); /* 他ページ h1 と同値 */
  line-height:1.08;
  text-wrap:balance;
  letter-spacing:0;
}
.about07 .lead{
  margin:0 auto;
  color:var(--muted);
  font-size:18px;
  max-width:760px;
}
.about07 .segments{
  display:grid;
  grid-template-columns:repeat(3, 1fr);
  gap:20px;
  margin-top:38px;
}
.about07 .segment{
  border:1px solid var(--line);
  border-radius:8px;
  background:#fff;
  overflow:hidden;
  text-align:left;
  box-shadow:0 20px 54px rgba(15,23,42,.10);
  display:flex;
  flex-direction:column;
}
.about07 .segment img{
  width:100%;
  aspect-ratio:16 / 9;
  object-fit:cover;
  border-bottom:1px solid var(--line);
}
.about07 .segment-body{
  padding:28px;
  display:flex;
  flex-direction:column;
  flex:1;
}
.about07 .role{
  display:inline-flex;
  align-items:center;
  gap:8px;
  color:var(--blue);
  font-size:13px;
  font-weight:700;
  margin-bottom:10px;
}
.about07 .role-dot{
  width:8px;
  height:8px;
  border-radius:999px;
  background:var(--green);
}
.about07 .segment h2{
  margin:0 0 10px;
  font-size:clamp(1.15rem, 2vw, 1.44rem); /* 他ページ h2 と同値(23px) */
  line-height:1.18;
  text-wrap:balance;
  letter-spacing:0;
}
.about07 .segment p{
  margin:0;
  color:var(--muted);
  font-size:15px;
}
.about07 .segment ul{
  margin:18px 0 0;
  padding:0;
  list-style:none;
  display:grid;
  gap:12px;
  color:#334155;
  font-size:15px;
  align-content:start;
  flex:1;
}
.about07 .segment li{
  display:flex;
  gap:9px;
}
.about07 .check{
  color:var(--green);
  font-weight:900;
}
.about07 .segment-actions{
  display:flex;
  flex-wrap:wrap;
  gap:12px;
  margin-top:26px;
}
.about07 .btn{
  min-height:46px;
  padding:11px 16px;
  border-radius:8px;
  border:1px solid var(--line);
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-weight:800;
  line-height:1.2;
}
.about07 .btn.primary{
  color:#fff;
  background:var(--blue);
  border-color:var(--blue);
}
.about07 .btn.secondary{
  background:#fff;
  color:var(--navy);
}
.about07 section{
  padding:80px 0;
}
.about07 .section-head{
  display:grid;
  grid-template-columns:.9fr 1.1fr;
  gap:38px;
  margin-bottom:32px;
  align-items:start;
}
.about07 h2.section-title{
  margin:0;
  font-size:clamp(1.2rem, 2.2vw, 1.7rem); /* 他ページ h2 と同水準 */
  line-height:1.18;
  text-wrap:balance;
  letter-spacing:0;
}
.about07 .section-head p{
  margin:0;
  color:var(--muted);
}
.about07 .section-head p a{
  color:var(--blue);
  font-weight:800;
}
/* 見出しだけの帯（07 の .section-head は2カラム前提なので1カラムに落とす） */
.about07 .section-head.solo{
  grid-template-columns:1fr;
}
.about07 .product{
  display:grid;
  grid-template-columns:1.1fr .9fr;
  gap:24px;
  align-items:stretch;
}
.about07 .screen{
  border:1px solid #cbd9e9;
  border-radius:8px;
  background:#fff;
  padding:10px;
  box-shadow:0 22px 58px rgba(15,23,42,.11);
}
.about07 .screen img{
  width:100%;
  height:100%;
  min-height:360px;
  object-fit:cover;
  border-radius:6px;
}
.about07 .feature-list{
  display:grid;
  gap:16px;
  align-content:start;
}
.about07 .feature{
  border:1px solid var(--line);
  border-radius:8px;
  background:#fff;
  padding:24px;
}
.about07 .feature h3{
  margin:0 0 7px;
  font-size:18px;
  line-height:1.35;
  text-wrap:balance;
}
.about07 .feature p{
  margin:0;
  color:var(--muted);
  font-size:15px;
}
/* 機能の詳細（07 に無い行）: .feature の中を「本文＋サムネ」の2カラムにするだけ。
   値は 07 のもの（gap 20px = .product、角丸 6px と枠 = .screen img / var(--line)）。 */
.about07 .feature.detail{
  display:grid;
  grid-template-columns:1fr 220px;
  gap:20px;
  align-items:center;
}
.about07 .detail-shot{
  width:100%;
  aspect-ratio:16 / 9;
  object-fit:cover;
  border-radius:6px;
  border:1px solid var(--line);
}
.about07 .detail-link{
  display:inline-block;
  margin-top:8px;
  color:var(--blue);
  font-weight:800;
  font-size:14px;
}
.about07 .soft{
  background:var(--soft);
  border-top:1px solid #e6edf5;
  border-bottom:1px solid #e6edf5;
}
.about07 .flow{
  display:grid;
  grid-template-columns:repeat(4, 1fr);
  gap:16px;
}
.about07 .flow-item{
  border:1px solid var(--line);
  border-radius:8px;
  background:#fff;
  padding:20px;
}
.about07 .flow-item strong{
  display:block;
  font-size:16px;
  margin-bottom:6px;
}
.about07 .flow-item p{
  margin:0;
  color:var(--muted);
  font-size:14px;
  line-height:1.7;
}
.about07 .cta-panel{
  display:grid;
  grid-template-columns:1fr auto;
  gap:28px;
  align-items:center;
  padding:40px;
  border-radius:8px;
  background:linear-gradient(135deg, var(--navy), var(--blue));
  color:#fff;
  box-shadow:0 22px 60px color-mix(in srgb, var(--color-accent) 23%, transparent);
}
.about07 .cta-panel h2{
  margin:0;
  font-size:clamp(1.2rem, 2.2vw, 1.7rem);
  line-height:1.18;
  text-wrap:balance;
  letter-spacing:0;
}
.about07 .cta-panel p{
  color:#dbeafe;
  margin:8px 0 0;
}
.about07 .cta-panel .btn{
  background:#fff;
  color:var(--navy);
  border-color:#fff;
}
.about07 .pc-break{ display:inline; }
.about07 .w{ display:inline-block; }
@media (max-width: 980px){
  .about07 .segments,
  .about07 .section-head,
  .about07 .product,
  .about07 .cta-panel{ grid-template-columns:1fr; }
  .about07 .flow{ grid-template-columns:repeat(2, 1fr); }
}
@media (max-width: 640px){
  .about07 .wrap{ width:min(100% - 28px, 1160px); }
  .about07 .hero{ padding:50px 0 58px; }
  .about07 .lead{ font-size:16px; }
  .about07 .segment-actions .btn,
  .about07 .cta-panel .btn{ width:100%; }
  .about07 section{ padding:60px 0; }
  .about07 .screen img{ min-height:250px; }
  .about07 .flow{ grid-template-columns:1fr; }
  .about07 .cta-panel{ padding:30px; }
  .about07 .feature.detail{ grid-template-columns:1fr; }
  .about07 .pc-break{ display:none; }
}
`;

type Bi = [string, string];

export default async function AboutPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = (v: Bi) => v[en ? 1 : 0];
  const lh = (href: string) => localizedHref(href, locale);

  // 立場別セグメント（07 の .segments。07 は2枚だがこちらは3枚）
  // ⚠ 見出しは 07 と同じく <span class="w"> の文節単位で折る（素のままだと
  //    「制作会社・ク / リエイター」のように語中で割れる）。JA/EN で要素数を揃える。
  const SEGMENTS: Array<{
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

  // 中核技術（07 の .product 右側 .feature-list）
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

  // 利用の流れ（07 の .flow 4列）
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

  // 仕組み（07 の .segment を流用した3ステップ）
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

  // 機能の詳細（07 の .feature を流用した9行）
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

  return (
    // theme-online は色目的ではなく、globals.css の
    // `main:has(> .theme-online) + footer { margin-top:0 }` を効かせるため
    // （付けないとライト地とフッターの間に黒帯が出る）。色は下の .about07 が全部上書きする。
    <div className="about07 theme-online">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── HERO（07 の .hero） ── */}
      <section className="hero">
        <div className="wrap">
          <div className="center">
            <span className="eyebrow">
              {en ? "For owners / For scouts" : "掲載する側 / 探す側"}
            </span>
            <h1>
              {en ? (
                <>
                  Real locations,
                  <span className="pc-break">
                    <br />
                  </span>{" "}
                  scouted in your browser.
                </>
              ) : (
                <>
                  <span className="w">実在の</span>
                  <span className="w">ロケ地を、</span>
                  <span className="pc-break">
                    <br />
                  </span>
                  <span className="w">ブラウザで</span>
                  <span className="w">歩いて</span>
                  <span className="w">下見。</span>
                </>
              )}
            </h1>
            <p className="lead">
              {en
                ? "Locahun3D scans real locations into 3DGS (3D Gaussian Splatting) data and lists them on this catalog. You can check a space's size, ceiling height and lighting without visiting, and buy the 3D data itself when you need it."
                : "ロケハン3D は、実在のロケ地を 3DGS（3D Gaussian Splatting）データ化してカタログに掲載しているサービスです。現地に行かなくても空間の広さ・天井高・光の入り方を確認でき、必要なら 3D データそのものを購入できます。"}
            </p>
          </div>
          <div className="segments">
            {SEGMENTS.map((s) => (
              <article className="segment" key={s.key}>
                {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
                <LightboxImage src={s.img.src} alt={t(s.img.alt)} />
                <div className="segment-body">
                  <span className="role">
                    <span className="role-dot" />
                    {t(s.role)}
                  </span>
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

      {/* ── 中核技術（07 の .section-head + .product） ── */}
      <section>
        <div className="wrap">
          <div className="section-head">
            <h2 className="section-title">
              {en ? (
                <>
                  It all rests on one high-fidelity 3D scan.
                </>
              ) : (
                <>
                  <span className="w">すべての</span>
                  <span className="w">土台は、</span>
                  <span className="w">高精細な</span>
                  <span className="w">3D スキャン。</span>
                </>
              )}
            </h2>
            <p>
              {en
                ? "Locations and studios are reconstructed as 3D Gaussian Splatting and made walkable in the browser. It is not CG modeling — the real dimensions, textures and lighting are recorded as they are, so owners can show a space honestly and scouts can compare it fairly."
                : "ロケ地・スタジオを 3D Gaussian Splatting として再構成し、ブラウザ上で歩いて確認できるようにします。CG モデリングではなく、実寸・実際の質感・照明をそのまま記録しているため、掲載する側は空間をありのまま見せられ、探す側は比較しやすくなります。"}
            </p>
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

      {/* ── 利用の流れ（07 の .soft + .flow） ── */}
      <section className="soft">
        <div className="wrap">
          <div className="section-head">
            <h2 className="section-title">
              {en ? (
                <>
                  Search, walk, assess, share.
                </>
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

      {/* ── 仕組み（07 の .segment を流用した3ステップ） ── */}
      <section>
        <div className="wrap">
          <div className="section-head">
            <h2 className="section-title">
              {en ? (
                <>
                  From a 20-minute walk to a published location.
                </>
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

      {/* ── 機能の詳細（07 の .feature を流用した9行） ── */}
      <section className="soft">
        <div className="wrap">
          <div className="section-head solo">
            <h2 className="section-title">
              {en ? "Everything, in detail." : "機能の詳細。"}
            </h2>
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
                  <LightboxImage
                    src={d.img.src}
                    alt={t(d.img.alt)}
                    className="detail-shot"
                  />
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA（07 の .cta-panel） ── */}
      <section>
        <div className="wrap cta-panel">
          <div>
            <h2>
              {en ? (
                <>
                  Take the next step, whichever side you&apos;re on.
                </>
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
            <a className="btn" href={DEMO_URL} target="_blank" rel="noopener">
              {en ? "▶ Try the demo — no sign-up" : "▶ デモを歩く — 登録不要"}
            </a>
            <Link className="btn" href={lh("/properties")}>
              {en ? "Browse the catalog →" : "物件を探す →"}
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
