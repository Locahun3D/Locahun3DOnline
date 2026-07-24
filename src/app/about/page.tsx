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
 * ページ構成（承認済みの組み合わせ・この順で表示）
 *   1. FEATURES  — 機能グリッド（できること概要）
 *   2. HOW IT WORKS — 工程帯（サムネイル付き3ステップ）
 *   3. DETAILS   — 一列の明細リスト（機能の詳細、画像があるものはサムネ添付）
 *   4. FOR       — 対象ファースト（3系統の読者別）
 *   5. （欠番。旧Q&Aは2026-07-25に /contact へ移設）
 *   6. PLANS     — 料金への導線
 * サムネイルはスキャンサービス側のデモ画像 (public/about/*.webp) を使用。
 * ────────────────────────────────────────────── */

export default async function AboutPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  // 1. できること（概要グリッド）
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
      label: ["保存・共有", "Share"],
      title: ["ブックマークして共有する", "Bookmark & share"],
      desc: [
        "物件を名前付きボードに保存できます。Studio / Team プランはボードの読み取り専用共有 URL を発行でき、クライアントやチームへの候補共有に使えます。",
        "Save properties into named boards. Studio / Team plans can publish a read-only share link per board — handy for sharing candidates with a client or team.",
      ],
    },
    {
      no: "05",
      label: ["連絡", "Contact"],
      title: ["掲示板・問い合わせ", "Board & inquiries"],
      desc: [
        "物件ごとの掲示板は誰でも閲覧できます（書き込みは有料プラン）。問い合わせフォームからはスタジオへ直接連絡が届きます。",
        "Each property has a board anyone can read (posting requires a paid plan). The inquiry form reaches the studio directly.",
      ],
    },
    {
      no: "06",
      label: ["活用", "Use cases"],
      title: ["AI・産業向けにも活用できます", "Also usable for AI & industrial applications"],
      desc: [
        "プリビズ・VFXだけでなく、工場や商業施設のデジタルツイン、研修・防災シミュレーションなどの産業用途にも活用できます。AIモデルの学習データとしての利用にも前向きです。案件によって条件が変わるため、まずはお気軽にご相談ください。",
        "Beyond previz and VFX, the data works for industrial use cases like digital twins of factories and commercial facilities, and training or disaster-prevention simulations. We're also open to AI-training use — terms just vary by case, so feel free to reach out and ask.",
      ],
      link: { href: "/contact/license", text: ["活用について相談する →", "Ask about use cases →"] },
    },
  ];

  // 2. 仕組み（サムネイル付き工程）
  const STEPS: Array<{
    no: string;
    img: { src: string; alt: [string, string] };
    title: [string, string];
    desc: [string, string];
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

  // 3. 機能の詳細（一列の明細リスト。画像がある行はサムネ添付）
  const DETAILS: Array<{
    no: string;
    label: [string, string];
    desc: [string, string];
    img?: { src: string; alt: [string, string] };
    link?: { href: string; text: [string, string]; external?: boolean };
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
        alt: ["ビューアのカメラツールでレンズ・アスペクト・セーフフレームを設定している画面", "Configuring lens, aspect and safe frames with the viewer's camera tools"],
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
        alt: ["購入した3DGSデータをUnreal Engineに取り込んでカメラワークを組んでいる画面", "Purchased 3DGS data imported into Unreal Engine for camera work"],
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
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ABOUT</span>
        <span>Service</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="text-center mb-14">
        <h1 className="serif text-[clamp(1.55rem,4.5vw,3.6rem)] font-bold leading-[1.3] max-w-[26ch] mx-auto">
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
        <p className="mt-4 sm:mt-6 text-[14px] text-muted max-w-[58ch] mx-auto leading-[1.85]">
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

      {/* 1. できること — 機能グリッド */}
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

      {/* 2. 仕組み — サムネイル付き工程 */}
      <section className="mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">HOW IT WORKS</span>
          <span>{en ? "Scan to catalog" : "仕組み"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="grid sm:grid-cols-3 gap-px bg-line border border-line">
          {STEPS.map((s, i) => (
            <div key={s.no} className="bg-white flex flex-col">
              <div className="relative aspect-[16/9] bg-[#eef2f5] overflow-hidden">
                {/* next/image は本構成で最適化404になるためプレーン <img>（クリックで拡大） */}
                <LightboxImage
                  src={s.img.src}
                  alt={s.img.alt[en ? 1 : 0]}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
              <div className="p-6">
                <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-2">
                  {s.no}
                  {i < STEPS.length - 1 && <span className="ml-2 opacity-50">→</span>}
                </div>
                <h3 className="text-[14px] font-bold mb-2">{s.title[en ? 1 : 0]}</h3>
                <p className="text-[12.5px] text-muted leading-[1.85]">{s.desc[en ? 1 : 0]}</p>
              </div>
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

      {/* 3. 機能の詳細 — 一列の明細リスト（画像がある行はサムネ添付） */}
      <section className="mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">DETAILS</span>
          <span>{en ? "Feature details" : "機能の詳細"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="border border-line bg-white">
          {DETAILS.map((d, i) => (
            <div
              key={d.no}
              className={`grid md:grid-cols-[190px_1fr_auto] gap-x-6 gap-y-3 items-center px-5 sm:px-6 py-4 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <div>
                <span className="mono text-[10px] tracking-[0.24em] uppercase text-accent">{d.no}</span>
                <span className="ml-2.5 text-[13.5px] font-bold">{d.label[en ? 1 : 0]}</span>
              </div>
              <div>
                <p className="text-[12.5px] text-muted leading-[1.85]">{d.desc[en ? 1 : 0]}</p>
                {d.link && (
                  <Link
                    href={lh(d.link.href)}
                    className="inline-block mt-1.5 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
                  >
                    {d.link.text[en ? 1 : 0]}
                  </Link>
                )}
              </div>
              {d.img && (
                <div className="w-full md:w-[190px] aspect-[16/9] bg-[#eef2f5] border border-line rounded-sm overflow-hidden relative">
                  <LightboxImage
                    src={d.img.src}
                    alt={d.img.alt[en ? 1 : 0]}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 4. 対象 — 読者別のご案内 */}
      <section className="mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">FOR</span>
          <span>{en ? "Who uses it" : "対象"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div className="grid sm:grid-cols-3 gap-px bg-line border border-line">
          <div className="bg-white p-6">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-3">
              {en ? "Production / creators" : "制作会社・クリエイター"}
            </div>
            <ul className="text-[12.5px] text-muted leading-[2.1] list-none">
              <li>{en ? "Search the catalog & map" : "カタログ・地図で候補を検索"}</li>
              <li>{en ? "Walk through in the browser" : "ブラウザで歩いて下見"}</li>
              <li>{en ? "Check the board for local notes" : "掲示板で現地の情報を確認"}</li>
              <li>{en ? "Visit only the finalists" : "現地確認は本命だけ"}</li>
            </ul>
            <Link
              href={lh("/properties")}
              className="inline-block mt-4 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
            >
              {en ? "Browse the catalog →" : "物件を探す →"}
            </Link>
          </div>
          <div className="bg-white p-6">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-3">
              {en ? "Studio / location owners" : "スタジオ・ロケ地オーナー"}
            </div>
            <ul className="text-[12.5px] text-muted leading-[2.1] list-none">
              <li>{en ? "One ~20-min scan to get listed" : "約 20 分のスキャン 1 回で掲載"}</li>
              <li>{en ? "Fewer walk-in viewings" : "内覧対応を削減"}</li>
              <li>{en ? "Inquiries reach you directly" : "問い合わせが直接届く"}</li>
              <li>{en ? "Free during our launch campaign (through Dec 31, 2026)" : "現在キャンペーンで掲載無料（2026年12月31日まで）"}</li>
            </ul>
            <Link
              href={lh("/contact/listing")}
              className="inline-block mt-4 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
            >
              {en ? "Request a listing →" : "掲載を依頼する →"}
            </Link>
          </div>
          <div className="bg-white p-6">
            <div className="mono text-[10px] tracking-[0.28em] uppercase text-accent mb-3">
              {en ? "Previz / VFX teams" : "プリビズ・VFX チーム"}
            </div>
            <ul className="text-[12.5px] text-muted leading-[2.1] list-none">
              <li>{en ? "Buy PLY / RAD / OBJ data" : "PLY / RAD / OBJ を購入"}</li>
              <li>{en ? "True-to-scale camera planning" : "実寸データでカメラ設計"}</li>
              <li>{en ? "Real backgrounds for boards" : "絵コンテに実背景を使用"}</li>
              <li>{en ? "Purchase from property pages" : "購入は各物件ページから"}</li>
            </ul>
            <Link
              href={lh("/properties")}
              className="inline-block mt-4 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
            >
              {en ? "Find a location →" : "物件を見る →"}
            </Link>
          </div>
        </div>
      </section>

      {/* 5. よくある疑問（Q&A）は /contact に移設（2026-07-25） */}

      {/* 6. 料金への導線 */}
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
