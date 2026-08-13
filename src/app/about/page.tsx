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
 * デザイン案 07（public/_design/home/07.html）の構成・見た目をそのまま採用したページ。
 * 2026-08-14 に旧「罫線主体・角なし・影なし」版から作り直し。
 *
 *   1. HERO      — 薄いグラデ帯 + 丸ピル eyebrow + h1 + リード
 *   2. SEGMENTS  — 立場別カード3枚（画像 / 役割 / 見出し / 1文 / ✓リスト / ボタン2つ）
 *   3. CORE      — 2カラム見出し帯 + 大スクショ(.screen) + 機能カード3枚
 *   4. FLOW      — 薄い背景の帯 + 2カラム見出し帯 + 4列フロー
 *   5. HOW IT WORKS — サムネイル付き3ステップ
 *   6. DETAILS   — 機能の詳細（明細リスト9行）
 *   7. CTA       — グラデーションパネル（左に見出し+一文 / 右にボタン）
 *
 * ⚠ トンマナ統一の対象は「色」だけ。07 の角丸 8px・カードの影・丸ピル・ボタン形状・
 *   余白（gap 18px 等）・ゴシック極太の見出しはそのまま活かす。差し替えるのは 07 の
 *   汎用青 (#155eef / #0d2f63 / #0891b2) → サイトのトークン
 *   （--color-accent / text-ink / text-muted / border-line）のみ。見出しに明朝系の
 *   `serif` ユーティリティは使わない（07 と印象が変わるため。2026-08-14 指摘）。
 * サムネイルはスキャンサービス側のデモ画像 (public/about/*.webp) を使用。
 * ────────────────────────────────────────────── */

type Bi = [string, string];

/* 07 の .btn / .btn.primary / .btn.secondary 相当（角丸 8px・min-height 46px）。
   色だけサイトの accent / line / ink トークンに差し替えている。 */
const BTN =
  "inline-flex items-center justify-center min-h-[46px] px-4 py-2.5 rounded-lg mono text-[11px] tracking-[0.14em] uppercase leading-tight text-center transition max-sm:w-full";
const BTN_PRIMARY = `${BTN} bg-accent border border-accent text-white hover:opacity-90`;
const BTN_SECONDARY = `${BTN} bg-white border border-line text-ink hover:border-accent hover:text-accent`;
const BTN_ON_ACCENT = `${BTN} bg-white border border-white text-accent hover:opacity-90`;

/* 07 の .segment / .screen の影を値ごと踏襲（白いカードが浮くのが 07 の見た目の核）。
   落ち影はアクセント色に寄せずニュートラルのままにする。
   ⚠ `rgb(0_0_0/0.10)` 記法だと Tailwind がクラスを生成せず影が消える（実測）。 */
const SHADOW_CARD = "shadow-[0_20px_54px_rgba(15,23,42,0.10)]";
const SHADOW_SCREEN = "shadow-[0_22px_58px_rgba(15,23,42,0.11)]";

/** 07 の .eyebrow（丸ピル）。色は accent、書体は mono。 */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/35 bg-accent/10 text-accent mono text-[10px] sm:text-[11px] tracking-[0.16em] uppercase leading-tight">
      {children}
    </span>
  );
}

export default async function AboutPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = (v: Bi) => v[en ? 1 : 0];
  const lh = (href: string) => localizedHref(href, locale);

  // 2. 立場別セグメント（07 の segments）
  const SEGMENTS: Array<{
    no: string;
    role: Bi;
    title: Bi;
    desc: Bi;
    img: { src: string; alt: Bi };
    points: Bi[];
    actions: Array<{ href: string; text: Bi; external?: boolean; primary?: boolean }>;
  }> = [
    {
      no: "01",
      role: ["需要側", "Demand side"],
      title: ["制作会社・クリエイター", "Production & creators"],
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
      no: "02",
      role: ["供給側", "Supply side"],
      title: ["スタジオ・ロケ地オーナー", "Studio & location owners"],
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
      no: "03",
      role: ["需要側", "Demand side"],
      title: ["プリビズ・VFX チーム", "Previz & VFX teams"],
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

  // 3. 核となる技術（07 の product ブロック右側の機能カード）
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

  // 4. 利用の流れ（旧 FEATURES 01〜04 を 1〜2 文に圧縮）
  const FLOW: Array<{ no: string; title: Bi; desc: Bi }> = [
    {
      no: "01",
      title: ["探す", "Search"],
      desc: [
        "エリア・カテゴリ・料金・天井高・面積・電源・駐車場・利用時間帯で絞り込み。駅や現在地からの距離順にも並べ替えられます。",
        "Filter by area, category, price, ceiling height, floor area, power, parking and time slots. Sort by distance from any station or your location.",
      ],
    },
    {
      no: "02",
      title: ["歩く", "Walk"],
      desc: [
        "物件ページからそのままウォークスルー。視聴はトークン制で、Free 登録で 6 トークンが付きます。",
        "Open a walkthrough right from the property page. Viewing uses tokens — 6 are granted at Free signup.",
      ],
    },
    {
      no: "03",
      title: ["検討する", "Assess"],
      desc: [
        "距離を実寸で測り、焦点距離 14〜200mm で構図を確認。必要なら 3D データ（PLY / RAD / OBJ）そのものを購入できます。",
        "Measure distances at true scale and frame shots at 14–200mm. Buy the 3D data itself (PLY / RAD / OBJ) when you need it.",
      ],
    },
    {
      no: "04",
      title: ["共有する", "Share"],
      desc: [
        "物件を名前付きボードに保存。Studio / Team プランは読み取り専用の共有 URL を発行できます。",
        "Save properties into named boards. Studio / Team plans can publish read-only share links.",
      ],
    },
  ];

  // 5. 仕組み（サムネイル付き工程）
  const STEPS: Array<{
    no: string;
    img: { src: string; alt: Bi };
    title: Bi;
    desc: Bi;
  }> = [
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
        alt: ["実写に3DGSの生ポイントクラウドを重ねた比較画像", "Photo blended with raw 3DGS point cloud data"],
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
        alt: ["公開された3DGSデータをビューアで歩いている画面", "Walking a published 3DGS capture in the viewer"],
      },
      title: ["カタログ公開", "Published to the catalog"],
      desc: [
        "完成データをカタログに掲載。以降はいつでもブラウザで視聴・購入できます。",
        "The finished capture is listed on the catalog, viewable and purchasable from a browser at any time.",
      ],
    },
  ];

  // 6. 機能の詳細（一列の明細リスト。画像がある行はサムネ添付）
  const DETAILS: Array<{
    no: string;
    label: Bi;
    desc: Bi;
    img?: { src: string; alt: Bi };
    link?: { href: string; text: Bi };
  }> = [
    {
      no: "01",
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
      no: "02",
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
      no: "03",
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
      no: "04",
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
      no: "05",
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
      no: "06",
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
      no: "07",
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
      no: "08",
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
      no: "09",
      label: ["AI・産業活用", "AI & industrial use"],
      desc: [
        "AIモデルの学習データ、工場・商業施設のデジタルツイン、防災・研修シミュレーションなど、プリビズ以外の産業活用にもご利用いただけます。AI学習目的の利用は事前のご相談・個別合意が必要ですが、当社としても前向きに取り組みたい分野です。まずはお気軽にお問い合わせください。",
        "The data also supports uses beyond previz — AI model training sets, digital twins for factories and commercial facilities, and disaster-prevention or training simulations. AI-training use needs prior consultation and a separate agreement, but it's an area we're genuinely excited about — reach out and let's talk.",
      ],
      link: { href: "/contact/license", text: ["活用について相談する →", "Ask about use cases →"] },
    },
  ];

  return (
    <div className="theme-online frame pb-12 sm:pb-24">
      {/* ── 1. HERO（07 の .hero: 上下グラデ + 中央寄せ eyebrow / h1 / lead） ── */}
      <section
        className="text-center pt-10 sm:pt-14 pb-10 sm:pb-14"
        style={{
          background:
            "linear-gradient(180deg, white, color-mix(in srgb, var(--color-accent) 9%, white))",
        }}
      >
        <Eyebrow>{en ? "For owners / For scouts" : "掲載する側 / 探す側"}</Eyebrow>
        <h1 className="mt-5 mb-4 font-black tracking-normal text-[clamp(1.9rem,5vw,4rem)] leading-[1.14] max-w-[24ch] mx-auto text-balance">
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
        <p className="text-[14px] sm:text-[16px] text-muted max-w-[58ch] mx-auto leading-[1.85]">
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

        {/* 07 の .segments（角丸カード + 影 + gap 18px） */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-[18px] mt-9 text-left">
          {SEGMENTS.map((s) => (
            <article
              key={s.no}
              className={`rounded-lg border border-line bg-white overflow-hidden flex flex-col ${SHADOW_CARD}`}
            >
              <div className="relative aspect-[16/9] bg-[#eef2f5] border-b border-line overflow-hidden">
                {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
                <LightboxImage
                  src={s.img.src}
                  alt={t(s.img.alt)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex flex-col flex-1">
                <span className="inline-flex items-center gap-2 mono text-[10px] tracking-[0.22em] uppercase text-accent mb-2.5">
                  <span aria-hidden className="w-2 h-2 rounded-full bg-accent" />
                  {s.no} — {t(s.role)}
                </span>
                <h2 className="font-black tracking-normal text-[clamp(1.15rem,2.2vw,1.5rem)] leading-[1.3] mb-2.5 text-balance">
                  {t(s.title)}
                </h2>
                <p className="text-[13.5px] text-muted leading-[1.8]">{t(s.desc)}</p>
                <ul className="mt-4 grid gap-2.5 text-[13px] text-ink/85 leading-[1.7] list-none flex-1 content-start">
                  {s.points.map((p) => (
                    <li key={p[0]} className="flex gap-2.5">
                      <span aria-hidden className="text-accent font-bold shrink-0">
                        ✓
                      </span>
                      <span>{t(p)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2.5 mt-5">
                  {s.actions.map((a) =>
                    a.external ? (
                      <a
                        key={a.href + a.text[0]}
                        href={a.href}
                        target="_blank"
                        rel="noopener"
                        className={a.primary ? BTN_PRIMARY : BTN_SECONDARY}
                      >
                        {t(a.text)}
                      </a>
                    ) : (
                      <Link
                        key={a.href + a.text[0]}
                        href={lh(a.href)}
                        className={a.primary ? BTN_PRIMARY : BTN_SECONDARY}
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
      </section>

      {/* ── 2. CORE（07 の section-head + product） ── */}
      <section className="py-14 sm:py-[72px]">
        <Eyebrow>{en ? "Core technology" : "核となる技術"}</Eyebrow>
        <div className="grid md:grid-cols-[0.9fr_1.1fr] gap-5 md:gap-[34px] items-start mt-5 mb-7">
          <h2 className="font-black tracking-normal text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.25] text-balance">
            {en ? (
              <>
                It all rests on one <br className="pc" />
                <em className="not-italic text-accent">high-fidelity 3D scan</em>.
              </>
            ) : (
              <>
                すべての土台は、<br className="pc" />
                <em className="not-italic text-accent">高精細な 3D スキャン</em>。
              </>
            )}
          </h2>
          <p className="text-[14px] text-muted leading-[1.85]">
            {en
              ? "Locations and studios are reconstructed as 3D Gaussian Splatting and made walkable in the browser. It is not CG modeling — the real dimensions, textures and lighting are recorded as they are, so owners can show a space honestly and scouts can compare it fairly."
              : "ロケ地・スタジオを 3D Gaussian Splatting として再構成し、ブラウザ上で歩いて確認できるようにします。CG モデリングではなく、実寸・実際の質感・照明をそのまま記録しているため、掲載する側は空間をありのまま見せられ、探す側は比較しやすくなります。"}
          </p>
        </div>
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-5 items-stretch">
          {/* 07 の .screen: 白い額縁 + 角丸 + 落ち影 */}
          <div className={`rounded-lg border border-line bg-white p-2.5 ${SHADOW_SCREEN}`}>
            <div className="relative rounded-md overflow-hidden bg-[#eef2f5] aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[360px]">
              {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
              <LightboxImage
                src="/about/walkthrough.webp"
                alt={
                  en
                    ? "Walking a published 3DGS capture in the viewer"
                    : "公開された3DGSデータをビューアで歩いている画面"
                }
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="grid gap-3.5 content-start">
            {CORE.map((c) => (
              <article key={c.title[0]} className="rounded-lg border border-line bg-white p-5">
                <h3 className="font-extrabold text-[17px] leading-[1.4] mb-1.5">{t(c.title)}</h3>
                <p className="text-[13.5px] text-muted leading-[1.8]">{t(c.desc)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. FLOW（07 の .soft 帯 + 4列） ── */}
      <section className="bg-accent/5 border border-line px-5 sm:px-8 py-12 sm:py-[64px] rounded-lg">
        <Eyebrow>{en ? "How you use it" : "利用の流れ"}</Eyebrow>
        <div className="grid md:grid-cols-[0.9fr_1.1fr] gap-5 md:gap-[34px] items-start mt-5 mb-7">
          <h2 className="font-black tracking-normal text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.25] text-balance">
            {en ? (
              <>
                Search, walk, <br className="pc" />
                assess, share.
              </>
            ) : (
              <>
                探して、歩いて、<br className="pc" />
                検討して、共有する。
              </>
            )}
          </h2>
          <p className="text-[14px] text-muted leading-[1.85]">
            {en
              ? "From catalog search to sharing with your team, the steps that come before a shoot can all be handled online."
              : "カタログ検索からチーム共有まで、撮影前の候補地検討に必要な流れをオンラインで進められます。"}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {FLOW.map((f) => (
            <div key={f.no} className="rounded-lg border border-line bg-white p-5">
              <span className="mono text-[10px] tracking-[0.22em] uppercase text-accent">{f.no}</span>
              <strong className="block text-[16px] font-extrabold leading-[1.4] mt-1 mb-1.5">
                {t(f.title)}
              </strong>
              <p className="text-[13px] text-muted leading-[1.75]">{t(f.desc)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. HOW IT WORKS（サムネイル付き3ステップ） ── */}
      <section className="py-14 sm:py-[72px]">
        <Eyebrow>{en ? "Scan to catalog" : "仕組み"}</Eyebrow>
        <h2 className="font-black tracking-normal text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.25] mt-5 mb-7 text-balance">
          {en ? (
            <>
              From a 20-minute walk <br className="pc" />
              to a published location.
            </>
          ) : (
            <>
              約 20 分の歩行スキャンから、<br className="pc" />
              カタログ公開まで。
            </>
          )}
        </h2>
        <div className="grid sm:grid-cols-3 gap-[18px]">
          {STEPS.map((s, i) => (
            <article
              key={s.no}
              className={`rounded-lg border border-line bg-white overflow-hidden flex flex-col ${SHADOW_CARD}`}
            >
              <div className="relative aspect-[16/9] bg-[#eef2f5] border-b border-line overflow-hidden">
                {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
                <LightboxImage
                  src={s.img.src}
                  alt={t(s.img.alt)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
              <div className="p-6">
                <span className="mono text-[10px] tracking-[0.22em] uppercase text-accent">
                  {s.no}
                  {i < STEPS.length - 1 && <span className="ml-2 opacity-50">→</span>}
                </span>
                <h3 className="font-extrabold text-[17px] leading-[1.4] mt-1.5 mb-1.5">
                  {t(s.title)}
                </h3>
                <p className="text-[13.5px] text-muted leading-[1.8]">{t(s.desc)}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-5 text-[13px] text-muted leading-[1.8]">
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

      {/* ── 5. DETAILS（機能の詳細・明細リスト9行） ── */}
      <section className="pb-14 sm:pb-[72px]">
        <Eyebrow>{en ? "Feature details" : "機能の詳細"}</Eyebrow>
        <h2 className="font-black tracking-normal text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.25] mt-5 mb-7 text-balance">
          {en ? "Everything, in detail." : "機能の詳細。"}
        </h2>
        <div className={`rounded-lg border border-line bg-white overflow-hidden ${SHADOW_CARD}`}>
          {DETAILS.map((d, i) => (
            <div
              key={d.no}
              className={`grid md:grid-cols-[200px_1fr_auto] gap-x-6 gap-y-3 items-center px-5 sm:px-6 py-5 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <div>
                <span className="mono text-[10px] tracking-[0.22em] uppercase text-accent">{d.no}</span>
                <span className="ml-2.5 text-[14.5px] font-extrabold">{t(d.label)}</span>
              </div>
              <div>
                <p className="text-[13px] text-muted leading-[1.8]">{t(d.desc)}</p>
                {d.link && (
                  <Link
                    href={lh(d.link.href)}
                    className="inline-block mt-2 mono text-[10px] tracking-[0.18em] uppercase text-accent hover:underline"
                  >
                    {t(d.link.text)}
                  </Link>
                )}
              </div>
              {d.img && (
                <div className="w-full md:w-[200px] aspect-[16/9] rounded-md border border-line bg-[#eef2f5] overflow-hidden relative">
                  <LightboxImage
                    src={d.img.src}
                    alt={t(d.img.alt)}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── 6. CTA パネル（07 の .cta-panel。グラデは accent の濃淡で作る） ── */}
      <section>
        <div
          className="rounded-lg text-white grid lg:grid-cols-[1fr_auto] gap-6 lg:gap-8 items-center p-7 sm:p-9 shadow-[0_22px_60px_rgba(15,23,42,0.22)]"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 55%, black), var(--color-accent))",
          }}
        >
          <div>
            <h2 className="font-black tracking-normal text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.25] text-balance">
              {en ? (
                <>
                  Take the next step, <br className="pc" />
                  whichever side you&apos;re on.
                </>
              ) : (
                <>
                  立場に合わせて、<br className="pc" />
                  次の一歩へ。
                </>
              )}
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-[1.8] text-white/85 max-w-[62ch]">
              {en
                ? "Four plans: Free / Individual / Studio / Team. Walkthrough viewing is token-based, and annual billing saves 20%. The demo requires no sign-up."
                : "プランは Free / Individual / Studio / Team の 4 段階。ウォークスルーの視聴はトークン制で、年払いは -20% です。デモは登録不要で視聴できます。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 lg:flex-col lg:min-w-[250px]">
            <a href={DEMO_URL} target="_blank" rel="noopener" className={BTN_ON_ACCENT}>
              {en ? "▶ Try the demo — no sign-up" : "▶ デモを歩く — 登録不要"}
            </a>
            <Link href={lh("/properties")} className={BTN_ON_ACCENT}>
              {en ? "Browse the catalog →" : "物件を探す →"}
            </Link>
            <Link
              href={lh("/pricing")}
              className={`${BTN} bg-transparent border border-white/70 text-white hover:bg-white/10`}
            >
              {en ? "See pricing" : "料金プランを見る"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
