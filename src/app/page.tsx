import { Fragment } from "react";
import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import LightboxImage from "@/components/about/lightbox-image";
import { ABOUT07_CSS } from "@/lib/design/about07-css";

/* ──────────────────────────────────────────────
 * トップページ
 *
 * 2026-08-16（1）: 旧トップ（スキャン/オンラインの2分割ゲートウェイ）を廃し、
 *   マーケサイトのマニフェストのコピーを白青（/about で確立した 07 案）で組み直した。
 * 2026-08-16（2）: そのマニフェスト部（HERO / CH.01 The Gap / CH.02 The Method の
 *   ツール9枚 / CH.03 The Outcome / EPILOGUE）を**本人指示で全削除**。
 *   代わりに旧 /about の内容（ヒーロー → 立場別3枚 → 中核技術 → 利用の流れ →
 *   仕組み3ステップ → 機能の詳細9行）がトップの本体になった。
 *   ナビの「サービスについて」項目も同時に廃止（本人指示）。ただし
 *   `#service` アンカーは /about・/en/about からのリダイレクト着地点として残す。
 *
 *  - 文言・画像・リンクは /about のものをそのまま。新規の創作はしない。
 *  - CSS は /about と同じ `.about07` スコープの共有 CSS（src/lib/design/about07-css.ts）。
 *    トップ固有の調整だけ EXTRA_CSS で足す。
 *  - 締めはサイト内の主要導線（物件を探す / デモ / 料金）へ着地させる CTA パネル。
 * ────────────────────────────────────────────── */

/** トップ固有の追加分（値は 07 の語彙に合わせてある）。 */
const EXTRA_CSS = `
/* 日本語の本文は文節で折る。about07 は 07 と字送りを合わせるため body の
   word-break:auto-phrase を normal に戻しているが、それだと狭い幅で
   「…をアシ / ストする。」のように語中で割れる（実測 390px）。
   トップは長い地の文が多いのでここだけ auto-phrase に戻す
   （非対応ブラウザでは従来どおり normal に落ちるだけ）。 */
.about07 .lead,
.about07 .feature p,
.about07 .segment p,
.about07 .section-head p,
.about07 .cta-panel p{
  word-break:auto-phrase;
}

/* #service — 旧 /about からのリダイレクト着地点。ナビ項目は無くなったが
   /about・/en/about は /#service へ飛ぶので、アンカーは残す。
   sticky ヘッダー（実 56px）の下に見出しが隠れないよう scroll-margin を取る。
   ⚠ .about07 は zoom:calc(1/var(--z)) が掛かっているため、この中の CSS px は
     1/--z 倍で描画される。実測: 1440px で 56px 指定だとセクション上端が
     ヘッダー下端より 11px 上に来たので 72px * --z にしてある。 */
.about07 #service{ scroll-margin-top:calc(72px * var(--z, 1)); }

/* ⚠ CTA パネルを .stack(1カラム) にしてはいけない（2026-08-16 本人指摘）。
   広い画面で中身が左端に張り付き、右半分が空く。07 本来の
   「左=テキスト / 右=ボタン」の2カラム（.cta-panel の既定）を使う。
   ボタン3つは右カラム内で縦に積む。980px 以下は既存の media query が
   1カラムへ落とすので狭幅は問題ない。 */
.about07 .cta-panel .segment-actions{ flex-direction:column; align-items:stretch; }
@media (max-width:980px){ .about07 .cta-panel .segment-actions{ flex-direction:row; } }
/* ⚠ 大型モニターでは .wrap ごと 1900px 超まで広がり、パネルの中身が左端に
   張り付いて見える（本人指摘 2026-08-27）。CTA だけは最大幅を切って中央に置く。
   1360px は本文グリッド（1160px）より一回り広く、通常のPCでは従来と同じ見た目。 */
.about07 .cta-panel{ max-width:1360px; margin-inline:auto; }

/* スマホ(<720px)のタップ領域。2026-08-27 に html の zoom を 0.7→1.0 に戻したので、
   ここの px はそのまま実 px になる。「物件一覧 →」等のリンクは 25px しか高さが
   無く指で押しにくいため、見た目の文字サイズは変えずに 44px の当たりを作る。
   ⚠ 720px は globals.css のズーム帯の境界と同じ。ずらさないこと。 */
@media (max-width:719px){
  .about07 .detail-link{
    display:inline-flex;
    align-items:center;
    min-height:44px;
  }
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

/* ──────────────────────────────────────────────
 * 日本語の説明文は「句点（。）ごとに改行」する（本人指示 2026-08-27
 * 「文章ごとの改行になっていないとわかりずらい」）。
 *  - 最終文の後には改行を入れない。
 *  - 全端末共通の意図改行なので `<br className="pc">` ではなく素の `<br />`。
 *    390px で1文が2行に折り返すのは正常（句点改行は保たれる）。
 *  - 英語は句点が無いので素通りする（EN は自然折り返しのまま）。
 *  - 文言そのものは変えない。改行の挿入だけ。
 * ────────────────────────────────────────────── */
function sentenceBreaks(text: string) {
  const parts = text.split("。");
  const tail = parts.pop() ?? "";
  if (parts.length === 0) return text;
  return (
    <>
      {parts.map((s, i) => (
        <Fragment key={i}>
          {s}。
          {i < parts.length - 1 || tail !== "" ? <br /> : null}
        </Fragment>
      ))}
      {tail}
    </>
  );
}

/* ──────────────────────────────────────────────
 * ここから下は 2026-08-16 に /about から移設した「サービスについて」節
 * （本人指示: /about を独立ページとしてやめ、トップ内の見出しへ昇格）。
 * 文言・画像・リンクは /about のものをそのまま。CSS も共有の ABOUT07_CSS。
 * ────────────────────────────────────────────── */
const SCAN_URL = "https://web.locahun3d.com/";
// ⚠ デモ誘導は「機能ツアー付きデモ」へ（本人指示 2026-08-16）。showcase=1 は
//   ビューアーの自動ツアーモード（実装作業中）。現行本番ビューアーは未知の
//   パラメータを無視するため、ツアーが乗る前でも普通のデモとして安全に動く。
const DEMO_TOUR_URL =
  "https://viewer.locahun3d.com/Locahun3D_OfflineViewer?demo=1&showcase=1";

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
      { href: DEMO_TOUR_URL, text: ["デモツアーを見る", "Take the demo tour"], external: true },
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
      { href: DEMO_TOUR_URL, text: ["デモツアーを見る", "Take the demo tour"], external: true },
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
  extLink?: { href: string; hrefEn: string; text: Bi };
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
    // 2026-08-16 本人指示「技術ブログにも誘導して」。works は外部(URL不変)なので extLink。
    extLink: {
      href: "https://web.locahun3d.com/works/index.html",
      hrefEn: "https://web.locahun3d.com/en/works/index.html",
      text: ["技術ブログで事例を見る →", "See examples on the tech blog →"],
    },
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

      {/* ══ HERO ＋ サービスについて（旧 /about をそのまま移設） ══
          ⚠ マニフェスト部を削除した結果、ここがページ冒頭になった。旧 /about の
             ヒーロー（.hero の淡いグラデ地 + chapter-rule + h1 + リード）を
             そのまま復元してある。h1 はページに1つだけ＝この見出し。
          ⚠ id="service" は外さないこと。ナビ項目は廃止したが、/about・/en/about は
             /#service・/en#service への恒久リダイレクトで、ここに着地する
             （src/app/about/page.tsx）。
          中身は /about の並び（立場別3枚 → 中核技術 → 4列フロー → 仕組み3ステップ
          → 機能の詳細9行）。文言・画像・リンクは変えていない。 */}
      <section id="service" className="hero">
        <div className="wrap">
          <div className="chapter-rule">
            <span className="opacity-60">ABOUT</span>
            <span>{en ? "Service" : "サービスについて"}</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          <div className="center">
            <h1>
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
            </h1>
            <p className="lead">
              {sentenceBreaks(
                en
                  ? "Locahun3D scans real locations into 3DGS (3D Gaussian Splatting) data and lists them on this catalog. You can check a space's size, ceiling height and lighting without visiting, and buy the 3D data itself when you need it."
                  : "ロケハン3D は、実在のロケ地を 3DGS（3D Gaussian Splatting）データ化してカタログに掲載しているサービスです。現地に行かなくても空間の広さ・天井高・光の入り方を確認でき、必要なら 3D データそのものを購入できます。"
              )}
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
                  <p>{sentenceBreaks(t(s.desc))}</p>
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
                  <p>{sentenceBreaks(t(c.desc))}</p>
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
              {sentenceBreaks(
                en
                  ? "From catalog search to sharing with your team, the steps that come before a shoot can all be handled online."
                  : "カタログ検索からチーム共有まで、撮影前の候補地検討に必要な流れをオンラインで進められます。"
              )}
            </p>
          </div>
          <div className="flow">
            {FLOW.map((f) => (
              <div className="flow-item" key={f.key}>
                <strong>{t(f.title)}</strong>
                <p>{sentenceBreaks(t(f.desc))}</p>
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
                  {/* 句点ごとに改行（本人指示 2026-08-27）。全端末共通なので素の <br />。 */}
                  スキャン自体は別サービスとして提供しています。
                  <br />
                  詳細は{" "}
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
                  <p>{sentenceBreaks(t(s.desc))}</p>
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
                  <p>{sentenceBreaks(t(d.desc))}</p>
                  {d.link && (
                    <Link className="detail-link" href={lh(d.link.href)}>
                      {t(d.link.text)}
                    </Link>
                  )}
                  {d.extLink && (
                    <a
                      className="detail-link"
                      style={{ marginLeft: d.link ? "18px" : 0 }}
                      href={en ? d.extLink.hrefEn : d.extLink.href}
                      target="_blank"
                      rel="noopener"
                    >
                      {t(d.extLink.text)}
                    </a>
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

      {/* ── 主要導線（旧 /about の CTA パネルをそのまま） ── */}
      <section>
        <div className="wrap cta-panel">
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
              {sentenceBreaks(
                en
                  ? "Four plans: Free / Individual / Studio / Team. Walkthrough viewing is token-based, and annual billing saves 20%. The demo requires no sign-up."
                  : "プランは Free / Individual / Studio / Team の 4 段階。ウォークスルーの視聴はトークン制で、年払いは -20% です。デモは登録不要で視聴できます。"
              )}
            </p>
          </div>
          <div className="segment-actions">
            {/* ⚠ デモはビューアー本体へ直接（旧 /about と同じ）。/pricing 内にも
                デモ導線はあるが、ここで /pricing を2つ並べると同じ行き先の
                ボタンが重複するため。 */}
            <a className="btn" href={DEMO_TOUR_URL} target="_blank" rel="noopener">
              {en ? "▶ Demo tour — no sign-up" : "▶ デモツアーを見る — 登録不要"}
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
