import Link from "next/link";
import {
  categoryLabel,
  isNewProperty,
  type Property,
} from "@/lib/schemas";
import { localizedHref, type Locale } from "@/lib/i18n/dictionaries";
import { resolveDownloadFiles } from "@/lib/downloads";
import ViewerGate from "@/components/viewer-gate";
import DataSalePanel from "@/components/data-sale-panel";
import StudioPageBlocks from "@/components/studio/studio-page-blocks";
import BookmarkButton from "@/components/bookmark-button";
import InquiryPanel from "@/components/inquiry-panel";
import ZoomableImage from "@/components/zoomable-image";
import PropertyMap from "@/components/property-map";
import PropertyComments, { type CommentItem } from "@/components/property-comments";
import PropertyReviews, { type ReviewItem } from "@/components/property-reviews";

/**
 * Eyebrow header — mono tracked "OVERVIEW —— 概要" style with a flexing
 * rule line, used throughout the SLATE BOARD (pattern-07) restyle.
 */
/** 見出し付きの縦積みキー・バリュー行（SPECS 以外の詳細ブロック用）。 */
function KeyVal({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2.5 border-b border-line last:border-0">
      <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted sm:w-[150px] shrink-0 pt-0.5">
        {k}
      </div>
      <div className="text-[14px] text-ink/90 whitespace-pre-line flex-1 leading-[1.8]">
        {children}
      </div>
    </div>
  );
}

function Eyebrow({ en, jp }: { en: string; jp: string }) {
  return (
    <h2 className="flex items-center gap-4 mono text-[10.5px] tracking-[0.26em] uppercase text-muted mb-6">
      <span className="text-accent font-medium">{en}</span>
      <span>—— {jp}</span>
      <span className="flex-1 h-px bg-current opacity-30" />
    </h2>
  );
}

/**
 * 概要テキストを描画。`【見出し】` 行を見出しとして強調し、本文は読みやすい
 * 段落に整形する（項目ごとに見出しが立ち、文字が細い問題を解消）。
 */
function renderOverview(text: string) {
  if (!text || !text.trim()) return null;
  const lines = text.replace(/\r/g, "").split("\n");
  const sections: { heading: string | null; body: string }[] = [];
  let cur: { heading: string | null; lines: string[] } = { heading: null, lines: [] };
  const flush = () =>
    sections.push({ heading: cur.heading, body: cur.lines.join("\n").trim() });
  for (const ln of lines) {
    const m = ln.match(/^\s*【(.+?)】\s*$/);
    if (m) {
      flush();
      cur = { heading: m[1], lines: [] };
    } else {
      cur.lines.push(ln);
    }
  }
  flush();

  return (
    <div className="space-y-5">
      {sections
        .filter((s) => s.heading || s.body)
        .map((s, i) => (
          <div key={i}>
            {s.heading && (
              <h3 className="text-[16px] font-bold text-ink mb-2.5 flex items-center gap-2.5">
                <span className="inline-block w-1 h-4 bg-accent rounded-sm shrink-0" />
                {s.heading}
              </h3>
            )}
            {s.body && (
              <p className="text-[15px] leading-[1.95] text-ink/85 whitespace-pre-line">
                {s.body}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}

export default function PropertyDetailView({
  property,
  others,
  preview = false,
  freeAccess = false,
  dataSaleFree = false,
  dataSaleDisabled = false,
  canViewRestricted = false,
  canViewNdaOnly = false,
  purchasedItemIds = [],
  unlockedItemIds = [],
  hasViewerAccess = false,
  signedIn = false,
  bookmarked = false,
  locale = "ja",
  previewControls = null,
  comments = [],
  reviews = [],
  reviewStats,
  currentUserId = null,
  currentUserName = null,
  isAdminUser = false,
  canPostBoard = false,
  canReview = false,
}: {
  property: Property;
  others: Property[];
  preview?: boolean;
  freeAccess?: boolean;
  /** 3Dデータ販売の限定無料期間中: 販売中データの購入価格を¥0にする。 */
  dataSaleFree?: boolean;
  /** 無料期間終了後「販売停止」設定の場合: 3Dデータ購入パネル自体を出さない。 */
  dataSaleDisabled?: boolean;
  canViewRestricted?: boolean;
  canViewNdaOnly?: boolean;
  /** 購入済みシーンの splatItem.id 群（並び替え・差し替えに強い）。 */
  purchasedItemIds?: string[];
  /** 1年以内にアンロック済みのシーンの splatItem.id 群（並び替え・差し替えに強い）。 */
  unlockedItemIds?: string[];
  hasViewerAccess?: boolean;
  signedIn?: boolean;
  bookmarked?: boolean;
  locale?: Locale;
  /** 管理プレビューのバナー内に差し込む追加コントロール（プラン切替等）。 */
  previewControls?: React.ReactNode;
  /** 会員限定掲示板の初期コメント一覧。 */
  comments?: CommentItem[];
  /** レビュー・評価の初期一覧。未サインインでは空配列（本文は非公開）。 */
  reviews?: ReviewItem[];
  /** 平均★と件数。カタログと同じく未サインインでも公開する集計値。 */
  reviewStats?: { average: number; count: number };
  currentUserId?: string | null;
  currentUserName?: string | null;
  isAdminUser?: boolean;
  /** 掲示板への書き込み権限（有料プラン: Individual / Studio / Team / admin）。閲覧は会員全員。 */
  canPostBoard?: boolean;
  /** レビュー投稿権限（3DGS視聴済み or admin）。 */
  canReview?: boolean;
}) {
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  const yen = property.hourlyPrice.toLocaleString(en ? "en-US" : "ja-JP");
  // 問い合わせ先（電話/メール/HP）が1つも無い物件は問い合わせを受け付けられない
  const hasContact = !!(
    property.contactPhone ||
    property.contactEmail ||
    property.contactWebsite
  );

  // フィルタ後も「元の splatItems 内 index」を保持する。トークン課金・アンロック
  // 判定はサーバ側の元 index を基準にするため、表示側もそれに合わせる必要がある。
  const visibleSplatItems = property.splatItems
    .map((it, origIndex) => ({ it, origIndex }))
    .filter(({ it }) => {
      if (!it.splatUrl) return false;
      if (it.accessLevel === "restricted" && !canViewRestricted) return false;
      if (it.accessLevel === "nda_only" && !canViewNdaOnly) return false;
      return true;
    });

  // ── ギャラリー: カバー画像はヒーローに出るので除外、重複 src も除外 ──
  const seen = new Set<string>([property.cover.src]);
  const galleryPhotos = property.gallery.filter((p) => {
    if (!p?.src || seen.has(p.src)) return false;
    seen.add(p.src);
    return true;
  });

  // ── スレート・データ行（実データのみ。無ければ行ごと省略） ──
  // 撮影メタ情報（PROD./SCENE/DATE/LOC.）ではなく、すぐ使える連絡先を
  // 同じ「スレート・データシート」の見た目のまま表示する。
  const slateRows: { k: string; v: string; href?: string }[] = [];
  if (property.contactPhone) {
    slateRows.push({ k: "TEL", v: property.contactPhone, href: `tel:${property.contactPhone}` });
  }
  if (property.contactEmail) {
    slateRows.push({
      k: "MAIL",
      v: property.contactEmail,
      href: `mailto:${property.contactEmail}`,
    });
  }
  if (property.contactWebsite) {
    slateRows.push({
      k: "HP",
      v: property.contactWebsite,
      href: /^https?:\/\//.test(property.contactWebsite)
        ? property.contactWebsite
        : `https://${property.contactWebsite}`,
    });
  }
  // 連絡先が一切無ければ、SCENE / LOC. の最小フォールバックに戻す。
  if (slateRows.length === 0) {
    slateRows.push({ k: "SCENE", v: property.id.toUpperCase() });
    if (property.prefecture || property.city) {
      slateRows.push({ k: "LOC.", v: `${property.prefecture} ${property.city}`.trim() });
    }
  }

  // ── SPECS 行 ──
  // 屋外（公道・公園等）はスタジオ向け設備（電源/駐車場/搬入口/防音/ネット）が
  // 軒並み「なし・—・通常」の無意味な羅列になりがちなので、値がある時だけ
  // 出す。一般のスタジオ等は従来どおり常時表示（「なし」も検索軸として意味がある）。
  const isOutdoorProperty = property.category === "outdoor";
  const parkingValue = property.parking
    ? property.parkingCapacity > 0
      ? en
        ? `Available (${property.parkingCapacity} cars)`
        : `利用可（${property.parkingCapacity}台）`
      : en
        ? "Available"
        : "利用可"
    : en
      ? "None"
      : "なし";
  const specRows: [string, string][] = [];
  if (property.address) specRows.push(["ADDRESS ／ 住所", property.address]);
  if (property.nearestStation) specRows.push(["STATION ／ 最寄り駅", property.nearestStation]);
  if (property.availableHours) specRows.push(["HOURS ／ 利用可能時間", property.availableHours]);
  if (property.availableDays) specRows.push(["DAYS ／ 撮影可能日", property.availableDays]);
  if (property.bookingDeadline) specRows.push(["LEAD TIME ／ 申込期限", property.bookingDeadline]);
  if (isOutdoorProperty) {
    if (property.powerVoltage) specRows.push(["POWER ／ 電源", property.powerVoltage]);
    if (property.parking) specRows.push(["PARKING ／ 駐車場", parkingValue]);
    if (property.loadingDock) specRows.push(["LOAD-IN ／ 搬入口", en ? "Large OK" : "大型搬入可"]);
    if (property.soundproofing) specRows.push(["SOUNDPROOF ／ 防音", en ? "Yes" : "あり"]);
    if (property.hasInternet) specRows.push(["INTERNET ／ ネット", en ? "Yes" : "あり"]);
  } else {
    specRows.push(["POWER ／ 電源", property.powerVoltage || "—"]);
    specRows.push(["PARKING ／ 駐車場", parkingValue]);
    specRows.push([
      "LOAD-IN ／ 搬入口",
      property.loadingDock ? (en ? "Large OK" : "大型搬入可") : en ? "Standard" : "通常",
    ]);
    specRows.push([
      "SOUNDPROOF ／ 防音",
      property.soundproofing ? (en ? "Yes" : "あり") : en ? "No" : "なし",
    ]);
    specRows.push([
      "INTERNET ／ ネット",
      property.hasInternet ? (en ? "Yes" : "あり") : en ? "No" : "なし",
    ]);
  }
  if (property.airConditioning) specRows.push(["AIR-CON ／ 空調", en ? "Yes" : "あり"]);
  if (property.greenRoom) specRows.push(["GREEN ROOM ／ 控室", en ? "Yes" : "あり"]);
  if (property.restroom) specRows.push(["RESTROOM ／ トイレ", en ? "Yes" : "あり"]);
  if (property.smokingArea) specRows.push(["SMOKING ／ 喫煙所", en ? "Yes" : "あり"]);
  if (property.fireAllowed) specRows.push(["OPEN FLAME ／ 火気使用", en ? "Allowed" : "可"]);
  specRows.push(["SCAN DATE ／ スキャン日", property.scannedAt || "—"]);

  // ── Pricing / Rules セクションの表示可否（横並び2カラム化の判定に使う） ──
  const showPricing =
    property.minUsageHours > 0 || !!property.scoutingFee || !!property.extraFees;
  const showRules =
    !!property.prohibitedItems ||
    !!property.cancellationPolicy ||
    property.insuranceRequired ||
    property.attendanceRequired;

  return (
    <article className="theme-online">
      {preview && (
        <div className="frame mb-0 sticky top-16 z-40 border border-amber-400/50 bg-amber-950 backdrop-blur-sm px-4 py-3 text-[13px] mono tracking-[0.08em] text-amber-300 flex flex-wrap items-center justify-between gap-3">
          <span>
            ● 管理プレビュー — ステータス:{" "}
            <strong className="uppercase">{property.status}</strong>
            （未公開でもこの画面で確認できます）
          </span>
          {previewControls}
          <Link
            href={`/admin/properties/${property.id}/edit`}
            className="underline hover:text-amber-200"
          >
            ← 編集に戻る
          </Link>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
       *  Breadcrumb — mono uppercase tracked, accent first segment
       * ══════════════════════════════════════════════════ */}
      <div className="frame pt-6">
        <nav className="mono text-[10.5px] tracking-[0.24em] uppercase text-muted flex gap-2 items-center">
          <Link href={lh("/properties")} className="text-accent hover:opacity-75 transition font-medium">
            CATALOG
          </Link>
          <span>/</span>
          <span>{categoryLabel(property.category, locale)}</span>
          <span>/</span>
          <span>{property.id.toUpperCase()}</span>
        </nav>
      </div>

      {/* ══════════════════════════════════════════════════
       *  Slate hero — dark clapperboard panel (left) + cover photo (right)
       * ══════════════════════════════════════════════════ */}
      <div className="frame pt-4">
        <header className="grid lg:grid-cols-[420px_1fr] border-x border-b border-line bg-white shadow-[0_1px_3px_rgba(20,24,28,0.05)]">
          {/* ── slate panel ── */}
          <div className="bg-[#14181c] text-[#fafaf6] flex flex-col">
            <div
              className="h-[34px]"
              style={{
                /* 斜めの繰り返しグラデーションはハードな色境界だとブラウザが
                   アンチエイリアスをかけずギザギザに描画される。各境界に
                   0.75px だけぼかしを挟んで滑らかにする（縞の見た目・幅は不変）。 */
                background:
                  "repeating-linear-gradient(-55deg, #fafaf6 0, #fafaf6 25.25px, #14181c 26.75px, #14181c 51.25px, #fafaf6 52.75px)",
              }}
            />
            <div className="px-7 py-7 sm:px-8 sm:py-8 flex flex-col flex-1">
              <div className="mono text-[10.5px] tracking-[0.18em] uppercase text-white/55">
                {slateRows.map((row) => (
                  <div
                    key={row.k}
                    className="flex justify-between gap-3 py-2.5 border-b border-dashed border-white/[0.16]"
                  >
                    <span>{row.k}</span>
                    {row.href ? (
                      <a
                        href={row.href}
                        target={row.href.startsWith("http") ? "_blank" : undefined}
                        rel={row.href.startsWith("http") ? "noopener noreferrer" : undefined}
                        className="font-normal text-right text-[#fafaf6] hover:text-accent transition break-all"
                      >
                        {row.v}
                      </a>
                    ) : (
                      <b className="font-normal text-right text-[#fafaf6]">{row.v}</b>
                    )}
                  </div>
                ))}
              </div>

              <h1 className="text-[clamp(24px,3vw,32px)] font-bold leading-[1.34] mt-6 mb-1.5">
                {property.title || (en ? "(Untitled location)" : "（無題の物件）")}
              </h1>
              <p className="text-[13px] text-white/55">
                {property.prefecture} {property.city}
              </p>
              {(() => {
                const visibleReviews = reviews.filter((r) => !r.hiddenByReports);
                if (visibleReviews.length === 0) return null;
                const avg =
                  Math.round(
                    (visibleReviews.reduce((acc, r) => acc + r.rating, 0) / visibleReviews.length) * 10,
                  ) / 10;
                return (
                  <div className="flex items-center gap-1.5 mt-1.5 text-accent">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                      <path d="M12 2.5l2.95 6.32 6.8.72-5.05 4.75 1.4 6.86L12 17.6l-6.1 3.55 1.4-6.86L2.25 9.54l6.8-.72L12 2.5z" />
                    </svg>
                    <span className="text-[12.5px] font-bold">{avg.toFixed(1)}</span>
                    <span className="mono text-[10.5px] text-white/50">
                      ({visibleReviews.length})
                    </span>
                  </div>
                );
              })()}

              <div className="flex flex-wrap gap-1.5 mt-4">
                {isNewProperty(property) && (
                  <span className="text-[11px] font-bold px-3 py-1 bg-[#e8443a] border border-[#e8443a] text-white mono tracking-[0.18em] uppercase">
                    New
                  </span>
                )}
                <span className="text-[11px] font-bold px-3 py-1 bg-accent border border-accent text-[#0a2a35]">
                  {categoryLabel(property.category, locale)}
                </span>
                {/* カテゴリ・種別・タグは実データ上で重複しがち（例: カテゴリ=学校、
                    タグにも「学校」）なので、既に表示したラベルと同名のものは出さない。 */}
                {(() => {
                  const shown = new Set([
                    categoryLabel(property.category, locale),
                    categoryLabel(property.category, "ja"),
                  ]);
                  const rest: string[] = [];
                  if (property.studioType && !shown.has(property.studioType)) {
                    shown.add(property.studioType);
                    rest.push(property.studioType);
                  }
                  for (const t of property.tags) {
                    if (rest.length >= 4) break;
                    if (shown.has(t)) continue;
                    shown.add(t);
                    rest.push(t);
                  }
                  return rest.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] font-bold px-3 py-1 border border-white/30 text-[#fafaf6]"
                    >
                      {t}
                    </span>
                  ));
                })()}
              </div>

              <div className="mt-auto pt-6">
                <p className="mono text-[24px] mb-3.5">
                  {property.priceType === "free" ? (
                    <small className="text-[13px] text-white/55 tracking-[0.1em]">
                      {en ? "Free" : "無料"}
                    </small>
                  ) : property.priceType === "flat" ? (
                    property.hourlyPrice > 0 ? (
                      <>
                        ¥{yen}{" "}
                        <small className="text-[11px] text-white/55 tracking-[0.16em]">
                          {en ? "(permit fee)" : "（撮影許可）"}
                        </small>
                      </>
                    ) : (
                      <small className="text-[13px] text-white/55 tracking-[0.1em]">
                        {en
                          ? "Filming permit required"
                          : `${property.permitType || "撮影許可"}の申請が必要です`}
                      </small>
                    )
                  ) : property.hourlyPrice > 0 ? (
                    <>
                      ¥{yen}{" "}
                      <small className="text-[11px] text-white/55 tracking-[0.16em]">/HR</small>
                    </>
                  ) : (
                    <small className="text-[13px] text-white/55 tracking-[0.1em]">
                      {en ? "Contact for pricing" : "お問い合わせください"}
                    </small>
                  )}
                </p>
                {property.priceType === "hourly" && property.dailyPrice > 0 && (
                  <p className="mono text-[11px] text-white/50 mb-4 -mt-2">
                    {en ? "Daily" : "日貸し"} ¥
                    {property.dailyPrice.toLocaleString(en ? "en-US" : "ja-JP")}/day
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={property.permitRequired ? "#permit-notice" : "#inquiry"}
                    className="inline-flex items-center gap-2 font-bold text-[13.5px] px-5 py-3 bg-accent border border-accent text-[#0a2a35] hover:brightness-[1.06] transition"
                  >
                    {property.permitRequired
                      ? en
                        ? "Permit info"
                        : `${property.permitType || "撮影許可"}について`
                      : en
                        ? "Contact us"
                        : "お問い合わせ"}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* ── cover photo ── */}
          <div className="relative min-h-[280px] lg:min-h-[440px] bg-[#14181c]">
            {property.cover.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={property.cover.src}
                alt={property.cover.alt}
                width={property.cover.width || undefined}
                height={property.cover.height || undefined}
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: property.cover.focus || "center" }}
              />
            ) : (
              // カバー未設定の下書きは真っ白な空洞に見えるため、テクスチャ付き
              // プレースホルダで「準備中」と分かるようにする。
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 14px)",
                }}
              >
                <span className="mono text-[10px] tracking-[0.28em] uppercase text-white/35">
                  {en ? "Cover coming soon" : "カバー画像 準備中"}
                </span>
              </div>
            )}
            {!preview && (
              <div className="absolute top-3 right-3 z-[3]">
                <BookmarkButton
                  propertyId={property.id}
                  initialBookmarked={bookmarked}
                  signedIn={signedIn}
                  revalidate={`/properties/${property.id}`}
                  variant="overlay"
                />
              </div>
            )}
            <span className="absolute bottom-3.5 right-4 z-[2] mono text-[10px] tracking-[0.22em] uppercase text-[#fafaf6] bg-[#14181c]/72 px-3 py-1.5">
              TAKE 01 — EXT.
            </span>
          </div>
        </header>
      </div>

      {/* ══════════════════════════════════════════════════
       *  Overview + Specs — side-by-side white cards
       * ══════════════════════════════════════════════════ */}
      <section className="frame pt-14">
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-8">
            <Eyebrow en="OVERVIEW" jp={en ? "Overview" : "概要"} />
            <div className="max-w-[36em]">
              {renderOverview(property.description) || (
                <p className="text-[15px] text-ink/60">
                  {en ? "No description yet." : "紹介文は準備中です。"}
                </p>
              )}
            </div>

            {/* mini metric grid, folded into the Overview card */}
            {/* 屋外は天井の概念がなく「自然光あり/なし」も常に自明（=矛盾して見える）
                ため、天井高セルだけを全幅表示にして自然光セルは出さない。 */}
            <div className="grid grid-cols-2 gap-3 mt-7">
              {property.category === "outdoor" ? (
                <div className="border border-line px-3 py-3 col-span-2">
                  <div className="mono text-[10px] tracking-[0.14em] uppercase text-muted mb-1.5">
                    {en ? "Ceiling" : "天井高"}
                  </div>
                  <span className="text-[22px] leading-none font-bold">
                    {en ? "Outdoor" : "屋外"}
                  </span>
                </div>
              ) : (
                [
                  [en ? "Ceiling" : "天井高", property.ceilingHeightM || "—", property.ceilingHeightM ? "m" : ""],
                  [
                    en ? "Natural light" : "自然光",
                    property.hasNaturalLight ? (en ? "Yes" : "あり") : en ? "No" : "なし",
                    "",
                  ],
                ].map(([label, value, unit]) => (
                  <div key={label as string} className="border border-line px-3 py-3">
                    <div className="mono text-[10px] tracking-[0.14em] uppercase text-muted mb-1.5">
                      {label}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[22px] leading-none font-bold">{value}</span>
                      {unit && <span className="text-[12px] text-ink/60">{unit}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>

            {property.permitRequired && (
              <div id="permit-notice" className="mt-6 border border-amber-400/60 bg-amber-50 px-4 py-3 scroll-mt-20">
                <div className="text-[11px] font-bold tracking-[0.12em] text-amber-700 mb-1">
                  {en ? "⚠ Permit required for filming" : "⚠ 撮影には許可の取得が必要です"}
                </div>
                {property.permitNotes && (
                  <p className="text-[12px] text-amber-900/90 leading-relaxed whitespace-pre-wrap">
                    {property.permitNotes}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-8 flex flex-col">
            <Eyebrow en="SPECS" jp={en ? "Specs" : "仕様"} />
            <table className="w-full text-[14px]">
              <tbody>
                {specRows.map(([label, value], i) => (
                  <tr key={label as string}>
                    <th
                      className={`text-left py-3.5 pr-2 mono text-[10px] tracking-[0.22em] uppercase text-muted font-normal w-[46%] border-b border-line ${
                        i === 0 ? "border-t-2 border-t-ink" : ""
                      }`}
                    >
                      {label}
                    </th>
                    <td
                      className={`text-left py-3.5 font-bold border-b border-line ${
                        i === 0 ? "border-t-2 border-t-ink" : ""
                      }`}
                    >
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Blueprints ── */}
            {property.blueprints &&
              property.blueprints.length > 0 &&
              property.blueprints.some((b) => b.url) && (
                <div className="mt-6 pt-6 border-t border-line">
                  <div className="mono text-[10px] tracking-[0.22em] uppercase text-muted mb-3">
                    {en ? "Floor plans" : "図面 ／ フロアプラン"}
                  </div>
                  <div className="space-y-2">
                    {property.blueprints
                      .filter((b) => b.url)
                      .map((b, i) => (
                        <a
                          key={i}
                          href={b.url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-[13px] border border-line px-3 py-2.5 hover:border-accent hover:text-accent transition"
                        >
                          <span className="text-accent">⬇</span>
                          <span className="flex-1 truncate text-[14px] text-ink/90 font-medium">
                            {b.label || (en ? `Plan ${i + 1}` : `図面 ${i + 1}`)}
                          </span>
                          <span className="mono text-[10px] tracking-[0.12em] uppercase text-ink/55 font-semibold">
                            DL
                          </span>
                        </a>
                      ))}
                  </div>
                </div>
              )}

            {/* ── mobile-only CTA fallback so #inquiry / bookmark are reachable
                 without needing to scroll all the way to Contact ── */}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
       *  Access — single-marker map + address / station
       * ══════════════════════════════════════════════════ */}
      {property.coords && (
        <section className="frame pt-12">
          <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-8">
            <Eyebrow en="ACCESS" jp={en ? "Access" : "アクセス"} />
            <div className="grid lg:grid-cols-[1fr_300px] gap-6">
              <div className="relative min-h-[280px]">
                <PropertyMap
                  lat={property.coords.lat}
                  lng={property.coords.lng}
                  label={property.title}
                />
              </div>
              <div className="flex flex-col">
                <div className="space-y-3 text-[14px] flex-1">
                  {property.address && (
                    <div>
                      <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-1">
                        {en ? "Address" : "住所"}
                      </div>
                      <div className="font-medium">{property.address}</div>
                    </div>
                  )}
                  {property.nearestStation && (
                    <div>
                      <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-1">
                        {en ? "Nearest station" : "最寄り駅"}
                      </div>
                      <div>{property.nearestStation}</div>
                    </div>
                  )}
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${property.coords.lat},${property.coords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block mono text-[11px] tracking-[0.15em] uppercase text-accent hover:underline"
                >
                  {en ? "Open in Google Maps →" : "Google Maps で開く →"}
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
       *  Pricing details + Rules & policy
       *  両方あれば横並び2カラムにして、片方だけの時のスカスカな全幅白カードを防ぐ。
       * ══════════════════════════════════════════════════ */}
      {(showPricing || showRules) && (
        <section className="frame pt-12">
          <div className={`grid gap-6 ${showPricing && showRules ? "lg:grid-cols-2" : ""}`}>
            {showPricing && (
              <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-8">
                <Eyebrow en="PRICING" jp={en ? "Pricing details" : "料金・利用条件"} />
                <div className="max-w-[46em]">
                  {property.minUsageHours > 0 && (
                    <KeyVal k={en ? "Min. booking" : "最低利用時間"}>
                      {en ? `${property.minUsageHours} h~` : `${property.minUsageHours}時間〜`}
                    </KeyVal>
                  )}
                  <KeyVal k={en ? "Tax" : "税"}>
                    {property.taxIncluded
                      ? en
                        ? "Tax included"
                        : "表示は税込"
                      : en
                        ? "Before tax"
                        : "表示は税別"}
                  </KeyVal>
                  {property.scoutingFee && (
                    <KeyVal k={en ? "Scout fee" : "ロケハン費"}>{property.scoutingFee}</KeyVal>
                  )}
                  {property.extraFees && (
                    <KeyVal k={en ? "Extra fees" : "追加費用"}>{property.extraFees}</KeyVal>
                  )}
                </div>
              </div>
            )}

            {showRules && (
              <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-8">
                <Eyebrow en="RULES" jp={en ? "Rules & policy" : "ルール・規程"} />
                <div className="max-w-[46em]">
                  {property.prohibitedItems && (
                    <KeyVal k={en ? "Prohibited" : "禁止事項"}>{property.prohibitedItems}</KeyVal>
                  )}
                  {property.cancellationPolicy && (
                    <KeyVal k={en ? "Cancellation" : "キャンセル"}>
                      {property.cancellationPolicy}
                    </KeyVal>
                  )}
                  {(property.insuranceRequired || property.attendanceRequired) && (
                    <KeyVal k={en ? "Requirements" : "必須事項"}>
                      <div className="flex flex-wrap gap-2">
                        {property.insuranceRequired && (
                          <span className="text-[11px] font-bold px-2.5 py-1 border border-amber-400/60 bg-amber-50 text-amber-800">
                            {en ? "Insurance required" : "保険加入 必須"}
                          </span>
                        )}
                        {property.attendanceRequired && (
                          <span className="text-[11px] font-bold px-2.5 py-1 border border-amber-400/60 bg-amber-50 text-amber-800">
                            {en ? "Attendance required" : "立ち会い 必須"}
                          </span>
                        )}
                      </div>
                    </KeyVal>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
       *  Gallery — "contact sheet" band, white print frames
       * ══════════════════════════════════════════════════ */}
      {galleryPhotos.length > 0 && (
        <section className="mt-14 py-14 bg-[#e9edf1] border-y border-line">
          <div className="frame">
            <Eyebrow en="CONTACT SHEET" jp={en ? "Gallery" : "ギャラリー"} />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {galleryPhotos.map((p, i) => (
                <figure
                  key={i}
                  className="bg-white p-2 pb-7 relative shadow-[0_2px_8px_rgba(20,24,28,0.09)]"
                  style={{
                    transform:
                      i % 3 === 0 ? "rotate(-0.6deg)" : i % 3 === 2 ? "rotate(0.5deg)" : undefined,
                  }}
                >
                  <div className="aspect-[4/3] overflow-hidden">
                    <ZoomableImage
                      src={p.src}
                      alt={p.alt}
                      focus={p.focus}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <figcaption className="absolute bottom-2 left-2.5 right-2.5 flex justify-between mono text-[9px] tracking-[0.2em] uppercase text-muted">
                    <span>FRAME {String(i + 1).padStart(2, "0")}</span>
                    <span className="truncate max-w-[50%] text-right">{p.alt}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
       *  3DGS — GS-xx mono chrome around untouched ViewerGate
       * ══════════════════════════════════════════════════ */}
      <div className="frame pt-14">
        {property.pageBlocks && property.pageBlocks.length > 0 ? (
          <section className="mb-16">
            <StudioPageBlocks
              blocks={property.pageBlocks}
              property={property}
              freeAccess={freeAccess}
              canViewRestricted={canViewRestricted}
              canViewNdaOnly={canViewNdaOnly}
              hasViewerAccess={hasViewerAccess}
              signedIn={signedIn}
              unlockedItemIds={unlockedItemIds}
            />
          </section>
        ) : visibleSplatItems.length === 0 ? (
          <section className="mb-16">
            <Eyebrow en="3DGS" jp={en ? "Walkthrough" : "ウォークスルー"} />
            <div className="border border-dashed border-line py-16 text-center bg-white">
              <p className="text-ink/40 text-[14px]">
                {en ? "3DGS data is coming soon." : "3DGSデータは準備中です。"}
              </p>
            </div>
          </section>
        ) : (
          <section className="mb-16">
            <Eyebrow en="3DGS" jp={en ? "Walkthrough" : "ウォークスルー"} />
            {/* 3DGSが複数ある時はページ幅で2つ並べる（1つなら全幅で大きく）。 */}
            <div
              className={
                visibleSplatItems.length > 1
                  ? "grid lg:grid-cols-2 gap-x-8 gap-y-10"
                  : "space-y-10"
              }
            >
              {visibleSplatItems.map(({ it: item, origIndex }, i) => (
                <section key={origIndex}>
                  <div className="flex items-baseline gap-3 mb-4 mono text-[11px] tracking-[0.16em] uppercase">
                    <span className="text-accent font-medium">
                      GS-{String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-ink/80 normal-case tracking-[0.02em] font-sans text-[13px] font-bold">
                      {item.label || (en ? "Virtual Walkthrough" : "3Dウォークスルー")}
                    </span>
                    <span className="flex-1 h-px bg-current opacity-20" />
                    <span className="text-muted">{item.sizeMb} MB</span>
                  </div>
                  <ViewerGate
                    splatUrl={item.splatUrl}
                    propertyId={property.id}
                    label={item.label || `#${origIndex + 1}`}
                    sizeMb={item.sizeMb}
                    previewVideoUrl={item.previewVideoUrl}
                    tokenCost={property.tokenCost}
                    freeAccess={freeAccess}
                    hasSubscription={hasViewerAccess}
                    signedIn={signedIn}
                    alreadyUnlocked={unlockedItemIds.includes(item.id)}
                  />
                  {/* 販売中でも配布ファイルが未設定の項目は「購入する」を出さない。
                      出すと必ずサーバ側 409 になる壊れた導線になる（購入ゲートと整合）。
                      salePrice===0 は「無料配布」として許可する（api/purchase 側で
                      Stripe を経由せず即時完了する）。dataSaleDisabled は限定無料期間
                      終了後に「販売停止」を選んだ場合、パネル自体を出さない。 */}
                  {item.forSale && !dataSaleDisabled && resolveDownloadFiles(item).length > 0 && (
                    <DataSalePanel
                      propertyId={property.id}
                      propertyTitle={property.title}
                      splatItemIndex={origIndex}
                      itemLabel={item.label}
                      price={dataSaleFree ? 0 : item.salePrice}
                      description={item.saleDescription}
                      scannedAt={property.scannedAt}
                      splatSizeMb={item.sizeMb}
                      zipSizeMb={property.zipSizeMb}
                      splatItemCount={property.splatItems.length}
                      tokenCost={property.tokenCost as 1 | 2 | 3 | 5}
                      downloadFileFormat={item.downloadFileFormat}
                      downloadFileSizeMb={item.downloadFileSizeMb}
                      captureDevice={item.captureDevice}
                      license={item.license}
                      alreadyPurchased={purchasedItemIds.includes(item.id)}
                    />
                  )}
                </section>
              ))}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════
         *  Community — CONTACT（常設）＋ 下2カラム（レビュー｜掲示板）
         *  常設の黒アクションバー（保存・問い合わせボタンだけの帯）は不要と
         *  判断され撤去。CONTACTカードは元通り常時表示に戻し、問い合わせ先が
         *  無い物件はカード内に「受け付けていません」の文言＋★保存だけ出す。
         * ══════════════════════════════════════════════════ */}
        {!preview && (
          <section id="inquiry" className="mb-14">
            <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-9 mb-4">
              <Eyebrow en="CONTACT" jp={en ? "Contact" : "お問い合わせ"} />
              <div className="grid lg:grid-cols-2 gap-8 items-start">
                <div className="text-[14px]">
                  {property.contactPhone && (
                    <div className="flex gap-5 py-3 border-b border-line">
                      <span className="mono text-[10px] tracking-[0.22em] uppercase text-muted w-[54px] pt-0.5 shrink-0">
                        TEL
                      </span>
                      <a
                        href={`tel:${property.contactPhone}`}
                        className="font-bold border-b border-ink/30 hover:text-accent hover:border-accent transition"
                      >
                        {property.contactPhone}
                      </a>
                    </div>
                  )}
                  {property.contactEmail && (
                    <div className="flex gap-5 py-3 border-b border-line">
                      <span className="mono text-[10px] tracking-[0.22em] uppercase text-muted w-[54px] pt-0.5 shrink-0">
                        MAIL
                      </span>
                      <a
                        href={`mailto:${property.contactEmail}`}
                        className="font-bold border-b border-ink/30 hover:text-accent hover:border-accent transition break-all"
                      >
                        {property.contactEmail}
                      </a>
                    </div>
                  )}
                  {property.contactWebsite && (
                    <div className="flex gap-5 py-3 border-b border-line last:border-0">
                      <span className="mono text-[10px] tracking-[0.22em] uppercase text-muted w-[54px] pt-0.5 shrink-0">
                        HP
                      </span>
                      <a
                        href={
                          /^https?:\/\//.test(property.contactWebsite)
                            ? property.contactWebsite
                            : `https://${property.contactWebsite}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold border-b border-ink/30 hover:text-accent hover:border-accent transition break-all"
                      >
                        {property.contactWebsite}
                      </a>
                    </div>
                  )}
                  {!hasContact && (
                    <p className="text-ink/50 text-[13px] py-3">
                      {en
                        ? "This property is not accepting inquiries at the moment."
                        : "この物件は現在お問い合わせを受け付けていません。"}
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  {hasContact && (
                    <InquiryPanel
                      propertyId={property.id}
                      propertyTitle={property.title}
                      locale={locale}
                    />
                  )}
                  <div className="[&>button]:w-full [&>button]:justify-center">
                    <BookmarkButton
                      propertyId={property.id}
                      initialBookmarked={bookmarked}
                      signedIn={signedIn}
                      revalidate={`/properties/${property.id}`}
                    />
                  </div>
                  {hasContact && (
                    <p className="mono text-[9.5px] tracking-[0.2em] uppercase text-muted pt-2">
                      RESPONSE WITHIN 1 BUSINESS DAY
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* レビュー｜掲示板 — 常時2カラムで両方表示（タブに畳まない） */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-9">
                <Eyebrow en="REVIEWS" jp={en ? "Reviews" : "レビュー・評価"} />
                <PropertyReviews
                  propertyId={property.id}
                  reviews={reviews}
                  stats={reviewStats}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  isAdmin={isAdminUser}
                  signedIn={signedIn}
                  canReview={canReview}
                  locale={locale}
                />
              </div>
              <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-9">
                <Eyebrow
                  en="BOARD"
                  jp={
                    en
                      ? "Board (viewing: members / posting: paid plans)"
                      : "掲示板（閲覧: 会員 / 書き込み: 有料プラン）"
                  }
                />
                <PropertyComments
                  propertyId={property.id}
                  comments={comments}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  isAdmin={isAdminUser}
                  signedIn={signedIn}
                  canPost={canPostBoard}
                  locale={locale}
                />
              </div>
            </div>
          </section>
        )}

        {/* 管理プレビュー時はコミュニティ（アクションバー/レビュー/掲示板）を
            出さない（実データ・実操作を伴うため）。プレビューは物件情報の
            確認に専念させる。 */}

        {/* ══════════════════════════════════════════════════
         *  Related studios
         * ══════════════════════════════════════════════════ */}
        <section className="mb-20">
          <Eyebrow en="RELATED" jp={en ? "Similar studios" : "類似スタジオ"} />
          {others.length > 0 ? (
            <div className="grid gap-4">
              {others.map((p) => (
                <Link
                  key={p.id}
                  href={lh(`/properties/${p.id}`)}
                  className="group grid grid-cols-[120px_1fr_auto] sm:grid-cols-[170px_1fr_auto] gap-4 sm:gap-6 items-center border border-line bg-white shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-4 py-4 sm:px-6 hover:border-accent transition max-w-[720px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.cover.src}
                    alt={p.cover.alt}
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-[2.39/1] object-cover"
                  />
                  <div>
                    <h3 className="font-bold text-[15px] leading-snug group-hover:text-accent transition">
                      {p.title}
                    </h3>
                    <p className="text-[12px] text-muted mt-0.5">
                      {p.area} · {p.city}
                    </p>
                    <div className="mono text-[10.5px] tracking-[0.12em] text-muted mt-1.5 flex gap-3.5">
                      {p.floorAreaSqm > 0 && <span>{p.floorAreaSqm} m²</span>}
                      {p.ceilingHeightM > 0 && (
                        <span>
                          {en ? "Ceiling" : "天井"} {p.ceilingHeightM}m
                        </span>
                      )}
                    </div>
                  </div>
                  {p.hourlyPrice > 0 && (
                    <span className="mono text-[16px] text-accent whitespace-nowrap">
                      ¥{p.hourlyPrice.toLocaleString()}/h
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-line py-16 text-center bg-white">
              <p className="text-ink/40 text-[14px]">
                {en ? "Similar studios are coming soon." : "現在、類似スタジオの掲載準備中です"}
              </p>
              <Link
                href={lh("/properties")}
                className="inline-block mt-4 mono text-[12px] tracking-[0.15em] uppercase text-accent hover:underline"
              >
                {en ? "See all locations →" : "すべての物件を見る →"}
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* ══════════════════════════════════════════════════
       *  Footer-gap filler — SiteFooter (site-wide) sits in <main>'s next
       *  sibling with `mt-32` (128px). That margin lives on <body>'s default
       *  black background, not inside this article's light `.theme-online`
       *  background, so a dark band shows above the footer. Rather than
       *  touching the shared footer/global CSS (used by every page), pull a
       *  themed filler up into exactly that margin with a matching negative
       *  margin — scoped to this component only. */}
      <div className="theme-online h-32 -mb-32" aria-hidden />
    </article>
  );
}
