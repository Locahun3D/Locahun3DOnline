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

/**
 * Eyebrow header — mono tracked "OVERVIEW —— 概要" style with a flexing
 * rule line, used throughout the SLATE BOARD (pattern-07) restyle.
 */
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
  canViewRestricted = false,
  canViewNdaOnly = false,
  purchasedItemIds = [],
  unlockedItemIds = [],
  hasViewerAccess = false,
  signedIn = false,
  bookmarked = false,
  locale = "ja",
  previewControls = null,
}: {
  property: Property;
  others: Property[];
  preview?: boolean;
  freeAccess?: boolean;
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
}) {
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  const yen = property.hourlyPrice.toLocaleString(en ? "en-US" : "ja-JP");

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
                        {en ? "Road-use permit required" : "道路使用許可の申請が必要です"}
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
                        : "道路使用許可について"
                      : en
                        ? "Contact us"
                        : "お問い合わせ"}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* ── cover photo ── */}
          <div className="relative min-h-[280px] lg:min-h-[440px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
            <div className="grid grid-cols-2 gap-3 mt-7">
              {[
                [en ? "Ceiling" : "天井高", property.ceilingHeightM || "—", "m"],
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
              ))}
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
                {[
                  ...(property.address
                    ? [["ADDRESS ／ 住所", property.address]]
                    : []),
                  ...(property.nearestStation
                    ? [["STATION ／ 最寄り駅", property.nearestStation]]
                    : []),
                  [en ? "POWER ／ 電源" : "POWER ／ 電源", property.powerVoltage || "—"],
                  [
                    "PARKING ／ 駐車場",
                    property.parking
                      ? property.parkingCapacity > 0
                        ? en
                          ? `Available (${property.parkingCapacity} cars)`
                          : `利用可（${property.parkingCapacity}台）`
                        : en
                          ? "Available"
                          : "利用可"
                      : en
                        ? "None"
                        : "なし",
                  ],
                  [
                    "LOAD-IN ／ 搬入口",
                    property.loadingDock ? (en ? "Large OK" : "大型搬入可") : en ? "Standard" : "通常",
                  ],
                  [
                    "SOUNDPROOF ／ 防音",
                    property.soundproofing ? (en ? "Yes" : "あり") : en ? "No" : "なし",
                  ],
                  [
                    "INTERNET ／ ネット",
                    property.hasInternet ? (en ? "Yes" : "あり") : en ? "No" : "なし",
                  ],
                  ["SCAN DATE ／ スキャン日", property.scannedAt || "—"],
                ].map(([label, value], i) => (
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
                      出すと必ずサーバ側 409 になる壊れた導線になる（購入ゲートと整合）。 */}
                  {item.forSale && item.salePrice > 0 && resolveDownloadFiles(item).length > 0 && (
                    <DataSalePanel
                      propertyId={property.id}
                      propertyTitle={property.title}
                      splatItemIndex={origIndex}
                      itemLabel={item.label}
                      price={item.salePrice}
                      description={item.saleDescription}
                      scannedAt={property.scannedAt}
                      splatSizeMb={item.sizeMb}
                      zipSizeMb={property.zipSizeMb}
                      splatItemCount={property.splatItems.length}
                      tokenCost={property.tokenCost as 1 | 2 | 3 | 5}
                      downloadFileFormat={item.downloadFileFormat}
                      downloadFileSizeMb={item.downloadFileSizeMb}
                      pointCount={item.pointCount}
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
         *  Contact — white card, mono-keyed rows + stacked CTAs
         * ══════════════════════════════════════════════════ */}
        <section id="inquiry" className="mb-14">
          <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-9">
            <Eyebrow en="CONTACT" jp={en ? "Contact" : "お問い合わせ"} />
            <div className="grid lg:grid-cols-2 gap-10 items-start">
              <div className="text-[14px]">
                {property.contactPhone && (
                  <div className="flex gap-5 py-3.5 border-b border-line">
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
                  <div className="flex gap-5 py-3.5 border-b border-line">
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
                  <div className="flex gap-5 py-3.5 border-b border-line last:border-0">
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
                {!property.contactPhone && !property.contactEmail && !property.contactWebsite && (
                  <p className="text-ink/50 text-[13px] py-3">
                    {en
                      ? "Use the inquiry form to get in touch."
                      : "フォームからお問い合わせください。"}
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <InquiryPanel
                  propertyId={property.id}
                  propertyTitle={property.title}
                  locale={locale}
                />
                <div className="[&>button]:w-full [&>button]:justify-center">
                  <BookmarkButton
                    propertyId={property.id}
                    initialBookmarked={bookmarked}
                    signedIn={signedIn}
                    revalidate={`/properties/${property.id}`}
                  />
                </div>
                <p className="mono text-[9.5px] tracking-[0.2em] uppercase text-muted pt-2">
                  {en ? "RESPONSE WITHIN 1 BUSINESS DAY" : "RESPONSE WITHIN 1 BUSINESS DAY"}
                </p>
              </div>
            </div>
          </div>
        </section>

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
