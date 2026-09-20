import Link from "next/link";
import styles from "./property-detail-view.module.css";
import { sceneIndexForId } from "@/lib/scene-selection";
import {
  categoryLabel,
  isNewProperty,
  type Property,
  type TokenCost,
} from "@/lib/schemas";
import { localizedHref, type Locale } from "@/lib/i18n/dictionaries";
import { resolveDownloadFiles } from "@/lib/downloads";
import { resolvePurchaseContents } from "@/lib/purchase-contents";
import PurchaseContents from "@/components/purchase-contents";
import { resolveLicenseOptions } from "@/lib/license-options";
import { isDataSaleFree, isDataSaleDisabled } from "@/lib/settings-schema";
import { fmtDateLongJST } from "@/lib/date-format";
import ViewerGate from "@/components/viewer-gate";
import DataSalePanel from "@/components/data-sale-panel";
import StudioPageBlocks from "@/components/studio/studio-page-blocks";
import BookmarkButton from "@/components/bookmark-button";
import InquiryPanel from "@/components/inquiry-panel";
import { Fragment } from "react";
import GalleryLightbox from "@/components/gallery-lightbox";
import PriceEstimator from "@/components/price-estimator";
import FloorPlanViewer from "@/components/floor-plan-viewer";
import PropertyAmenities from "@/components/property-amenities";
import { googleMapsEmbedUrl, googleMapsUrl, publicPropertyEmail, propertyTitleLines, propertyTitleSegments } from "@/lib/property-presentation";

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

function Eyebrow({ jp }: { en: string; jp: string }) {
  return (
    <h2 className="ui-section-title text-ink mb-6">{jp}</h2>
  );
}

/**
 * 概要テキストを描画。`【見出し】` 行を見出しとして強調し、本文は読みやすい
 * 段落に整形する（項目ごとに見出しが立ち、文字が細い問題を解消）。
 */
/**
 * 日本語の段落は句点（。）ごとに改行して1文＝1行にする（サイト共通ルール、
 * CLAUDE.md「説明文は句点ごとに改行」）。長い1文は文節単位で自然に折り返す
 * （body の word-break: auto-phrase）。閉じ括弧の直前では切らない。
 */
function sentenceLines(body: string) {
  const parts = body.split(/(?<=。)(?![」』）\)])/);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && !part.endsWith("\n") && <br />}
    </Fragment>
  ));
}

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
              <h3 className="ui-card-title text-ink mb-2.5 flex items-center gap-2.5">
                <span className="inline-block w-1 h-4 bg-accent rounded-sm shrink-0" />
                {s.heading}
              </h3>
            )}
            {s.body && (
              <p className="text-[15px] leading-[1.95] text-ink/85 whitespace-pre-line">
                {sentenceLines(s.body)}
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
  initialSceneId,
  preview = false,
  displaySimulation = false,
  sharePreview = false,
  previewToken,
  previewExpiresAt,
  freeAccess = false,
  nowIso = new Date().toISOString(),
  canViewRestricted = false,
  canViewNdaOnly = false,
  purchasedItemIds = [],
  unlockedItemIds = [],
  hasViewerAccess = false,
  signedIn = false,
  bookmarked = false,
  locale = "ja",
  previewControls = null,
  isAdminUser = false,
}: {
  initialSceneId?: string;
  property: Property;
  others: Property[];
  preview?: boolean;
  /** Admin-only visual simulation: no real viewing, checkout, or cart mutations. */
  displaySimulation?: boolean;
  /** 先方スタジオ共有用の限定プレビュー(ログイン不要)。購入/関連を抑制し、
   *  3DGS は previewToken 経由で課金ゲートを外して閲覧可能にする。 */
  sharePreview?: boolean;
  /** 共有プレビュー時のアクセストークン。ViewerGate → /api/viewer-asset に渡す。 */
  previewToken?: string;
  /** 共有プレビューの有効期限(バナー表示用)。 */
  previewExpiresAt?: string;
  freeAccess?: boolean;
  /**
   * 3Dデータ販売の限定無料期間はアイテム単位(item.freePeriod)で判定するため、
   * ここでは判定の基準時刻だけを受け取る（省略時はレンダリング時刻）。
   */
  nowIso?: string;
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
  isAdminUser?: boolean;
}) {
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  const floorPlans = (property.blueprints ?? []).filter((b) => b.url);
  const heroTitle = propertyTitleLines(property.title);
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

  const initialSceneIndex = sceneIndexForId(visibleSplatItems.map(({it}) => it.id), initialSceneId);

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
  const displayedEmail = publicPropertyEmail(property.id, property.contactEmail);
  const mapsUrl = googleMapsUrl(property.coords, property.address, property.title);
  const mapsEmbedUrl = googleMapsEmbedUrl(property.coords, property.address, property.title);
  const websiteHref = property.contactWebsite
    ? /^https?:\/\//.test(property.contactWebsite)
      ? property.contactWebsite
      : `https://${property.contactWebsite}`
    : "";
  // TEL 行は出さない（2026-09-20 本人指示: 大きすぎる。すぐ下に「電話する」ボタンがある）
  if (displayedEmail) {
    slateRows.push({
      k: "MAIL",
      v: displayedEmail,
      href: `mailto:${displayedEmail}`,
    });
  }
  // HP 行は廃止（2026-09-20 本人指示）: 公式サイトは行の右端リンクではなく、
  // 行の下に左詰めのボタンとして出し、同じ寸法の「保存」ボタンを並べる。
  // 連絡先が一切無ければ、SCENE / LOC. の最小フォールバックに戻す。
  if (slateRows.length === 0 && !websiteHref) {
    slateRows.push({ k: "SCENE", v: property.id.toUpperCase() });
    if (property.prefecture || property.city) {
      slateRows.push({ k: "LOC.", v: `${property.prefecture} ${property.city}`.trim() });
    }
  }

  // ── SPECS 行 ──
  // どの行も値がある時だけ出す（空欄を「—」で埋めた行は情報にならない）。
  const specRows: [string, string][] = [];
  if (property.address) specRows.push(["ADDRESS ／ 住所", property.address]);
  if (property.nearestStation) specRows.push(["STATION ／ 最寄り駅", property.nearestStation]);
  const customHoursLabel =
    property.customHoursStart && property.customHoursEnd
      ? `${property.customHoursStart}〜${property.customHoursEnd}`
      : "";
  if (customHoursLabel) {
    specRows.push([
      en ? "TIME SLOTS ／ Available hours" : "TIME SLOTS ／ 利用可能な時間帯",
      property.availableHours ? `${customHoursLabel}（${property.availableHours}）` : customHoursLabel,
    ]);
  } else if (property.availableHours) {
    specRows.push(["HOURS ／ 利用可能時間", property.availableHours]);
  }
  if (property.availableDays) specRows.push(["DAYS ／ 撮影可能日", property.availableDays]);
  if (property.bookingDeadline) specRows.push(["LEAD TIME ／ 申込期限", property.bookingDeadline]);
  // 駐車場・搬入・防音などの有無は表ではなくアイコン欄（PropertyAmenities）で見せる。
  // 駐車場の台数は出さない（HPとの食い違い・オーナー事情のリスク — 2026-09-19 会議）。
  if (property.floorAreaSqm > 0) specRows.push(["AREA ／ 面積", `${property.floorAreaSqm} ㎡`]);
  // 天井高は概要カードの枠をやめて仕様の行に出す（屋外は天井の概念がないので出さない）
  if (property.ceilingHeightM > 0 && property.category !== "outdoor") specRows.push(["CEILING ／ 天井高", `${property.ceilingHeightM} m`]);
  if (property.capacity > 0) {
    specRows.push(["CAPACITY ／ 収容", en ? `${property.capacity} people` : `${property.capacity} 名`]);
  }
  // 2026-09-20: 値が空の行は「—」で埋めず、行ごと出さない。
  if (property.powerVoltage) specRows.push(["POWER ／ 電源", property.powerVoltage]);

  // ── 検索用タグ（種別＋タグ、カテゴリと重複するものは除く） ──
  const categoryNames = new Set([categoryLabel(property.category, locale), categoryLabel(property.category, "ja")]);
  const searchTags = [...new Set([property.studioType, ...property.tags].filter((t): t is string => !!t))].filter(
    (t) => !categoryNames.has(t),
  );

  // ── Pricing / Rules セクションの表示可否（横並び2カラム化の判定に使う） ──
  const showPricing =
    property.minUsageHours > 0 || !!property.scoutingFee || !!property.extraFees;
  const showRules =
    !!property.prohibitedItems ||
    !!property.cancellationPolicy ||
    property.insuranceRequired ||
    property.attendanceRequired;

  return (
    <article data-property-legacy className={`theme-online ${styles.legacy}`}>
      {preview && sharePreview && (
        <div className="frame mb-0 sticky top-[calc(var(--header-h)/var(--z))] z-40 border border-[#5ec8e8]/40 bg-[#0c1b22] backdrop-blur-sm px-4 py-3 text-[13px] mono tracking-[0.08em] text-[#8fdcf0] flex flex-wrap items-center justify-between gap-3">
          <span>
            ● 限定プレビュー（共有用・非公開）—
            公開前の物件を確認いただいています。
          </span>
          {previewExpiresAt && (
            <span className="text-[#8fdcf0]/70 normal-case tracking-normal">
              有効期限:{" "}
              {fmtDateLongJST(previewExpiresAt)}
            </span>
          )}
        </div>
      )}
      {preview && !sharePreview && (
        <div className="frame mb-0 sticky top-[calc(var(--header-h)/var(--z))] z-40 border border-amber-400/50 bg-amber-950 backdrop-blur-sm px-4 py-3 text-[13px] mono tracking-[0.08em] text-amber-300 flex flex-wrap items-center justify-between gap-3">
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
        <nav className="mono text-[10.5px] tracking-[0.24em] uppercase text-muted flex flex-wrap gap-2 items-center">
          <Link href={lh("/properties")} className="text-accent hover:opacity-75 transition font-medium max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px]">
            {en ? "Properties" : "物件を探す"}
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
          {/* min-w-0: 長い欧文名でグリッド列が320px幅からはみ出さないように（2026-09-20） */}
          {/* @container: 写真と縦積みになる幅（lg未満）では、料金とボタンをタイトルの右へ回して板を低くし、
              カバー写真を大きく見せる（2026-09-20 本人指示「縦画面で右が空きすぎ」）。判定は画面幅でなく板の幅
              （管理プレビューはサイドバーぶん狭い）。lg以上の横並びでは従来どおり下端に置く。 */}
          <div className="@container bg-[#14181c] text-[#fafaf6] flex flex-col min-w-0">
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
            <div className="px-7 py-7 sm:px-8 sm:py-8 flex flex-col flex-1 max-lg:@sm:grid max-lg:@sm:grid-cols-[minmax(0,1fr)_auto] max-lg:@sm:gap-x-5 max-lg:@2xl:gap-x-10 max-lg:@sm:items-end">
              <div className={`max-lg:@sm:col-span-2 mono text-[10.5px] max-[720px]:text-[11px] tracking-[0.18em] max-[720px]:tracking-[0.05em] uppercase text-white/55 ${slateRows.length === 0 ? "hidden" : ""}`}>
                {slateRows.map((row) => (
                  <div
                    key={row.k}
                    className="flex justify-between max-[720px]:items-center gap-3 py-2.5 border-b border-dashed border-white/[0.16]"
                  >
                    <span>{row.k}</span>
                    {row.href ? (
                      <a
                        href={row.href}
                        target={row.href.startsWith("http") ? "_blank" : undefined}
                        rel={row.href.startsWith("http") ? "noopener noreferrer" : undefined}
                        className={`text-right text-[#fafaf6] max-[720px]:inline-flex max-[720px]:items-center max-[720px]:justify-end max-[720px]:min-h-[44px] hover:text-accent transition break-all ${
                          row.k === "TEL" ? "text-[18px] font-bold tracking-[0.04em] normal-case" : "font-normal"
                        }`}
                      >
                        {row.v}
                      </a>
                    ) : (
                      <b className="font-normal text-right text-[#fafaf6]">{row.v}</b>
                    )}
                  </div>
                ))}
              </div>

              {/* 公式サイト＋保存: 左詰め・同寸のボタン2つ（2026-09-20 本人指示）。
                  板が横並び（@sm）の時も2列ぶち抜きで行の直下に置く。プレビューでは保存は動かさない。 */}
              <div data-slate-actions className="max-lg:@sm:col-span-2 mt-4 flex flex-wrap justify-start gap-2">
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 font-bold text-[13px] min-w-[108px] max-[340px]:min-w-0 max-[340px]:flex-1 px-4 max-[720px]:px-3 py-2.5 max-[720px]:min-h-[44px] border border-white/40 text-[#fafaf6] hover:border-accent hover:text-accent transition"
                  >
                    {en ? "Website" : "公式サイト"}
                    <span aria-hidden className="text-[12px] leading-none">↗</span>
                  </a>
                )}
                {preview ? (
                  <button
                    type="button"
                    disabled
                    title={en ? "Disabled in preview" : "プレビューでは動きません"}
                    className="inline-flex items-center justify-center gap-2 font-bold text-[13px] min-w-[108px] max-[340px]:min-w-0 max-[340px]:flex-1 px-4 max-[720px]:px-3 py-2.5 max-[720px]:min-h-[44px] border border-dashed border-white/30 text-white/45 cursor-not-allowed"
                  >
                    <span className="text-[15px] leading-none">☆</span>
                    {en ? "Save" : "保存する"}
                  </button>
                ) : (
                  <BookmarkButton
                    propertyId={property.id}
                    initialBookmarked={bookmarked}
                    signedIn={signedIn}
                    revalidate={`/properties/${property.id}`}
                    variant="slate"
                  />
                )}
              </div>

              {/* スタジオ名を1行目に独立させ、残りは意味のまとまりごとに改行する（2026-09-20 本人指示）。
                  長い1語は従来どおり語単位で折り返す。 */}
              <div className="min-w-0">
              <h1 className="mt-6 mb-1.5 min-w-0 font-bold whitespace-pre-wrap [overflow-wrap:anywhere]">
                <span className="block text-[26px] lg:text-[34px] leading-[1.3]">
                  {propertyTitleSegments(heroTitle.name || (en ? "(Untitled location)" : "（無題の物件）")).map((part, index) => (
                    <span key={index} className="inline-block max-w-full align-baseline [overflow-wrap:anywhere]">{part}</span>
                  ))}
                </span>
                {heroTitle.lines.map((line, i) => (
                  <span key={i} className="block text-[17px] lg:text-[20px] leading-[1.55] text-white/85 first-of-type:mt-0 mt-0.5">
                    {propertyTitleSegments(line).map((part, index) => (
                      <span key={index} className="inline-block max-w-full align-baseline [overflow-wrap:anywhere]">{part}</span>
                    ))}
                  </span>
                ))}
              </h1>
              <p className="text-[13px] text-white/55">
                {property.prefecture} {property.city}
              </p>
              </div>

              <div className="mt-auto pt-6 max-lg:@sm:pt-0 max-lg:@sm:text-right">
                {!(property.permitRequired && property.priceType === "flat" && property.hourlyPrice === 0) && <p className="mono text-[24px] mb-3.5">
                  {property.priceType === "free" ? (
                    <small className="text-[13px] text-white/55 tracking-[0.1em]">
                      {en ? "Free" : "無料"}
                    </small>
                  ) : property.priceType === "flat" ? (
                    property.hourlyPrice > 0 ? (
                      <>
                        <span className="text-accent">¥{yen}</span>{" "}
                        <small className="text-[11px] text-white/55 tracking-[0.16em]">
                          {en ? "(permit fee)" : "（撮影許可）"}
                        </small>
                      </>
                    ) : (
                      <small className="text-[13px] text-white/55 tracking-[0.1em]">
                        {en
                          ? `${property.permitType || "Filming permit"} required`
                          : `${property.permitType || "撮影許可"}の申請が必要です`}
                      </small>
                    )
                  ) : property.hourlyPrice > 0 ? (
                    <>
                      <span className="text-accent">¥{yen}</span>{" "}
                      <small className="text-[11px] text-white/55 tracking-[0.16em]">/HR</small>
                    </>
                  ) : (
                    <small className="text-[13px] text-white/55 tracking-[0.1em]">
                      {en ? "Contact for pricing" : "お問い合わせください"}
                    </small>
                  )}
                </p>}
                {property.priceType === "hourly" && property.dailyPrice > 0 && (
                  <p className="mono text-[11px] text-white/50 mb-4 -mt-2">
                    {en ? "Daily" : "日貸し"}{" "}
                    <span className="text-accent">¥{property.dailyPrice.toLocaleString(en ? "en-US" : "ja-JP")}</span>/day
                  </p>
                )}
                <div className="flex flex-wrap gap-2 max-lg:@sm:flex-col max-lg:@sm:items-stretch max-lg:@sm:text-center max-lg:@sm:[&>a]:justify-center max-lg:@sm:[&>a]:px-3.5 max-lg:@2xl:flex-row max-lg:@2xl:justify-end max-lg:@2xl:[&>a]:px-5">
                  <a
                    href={property.permitRequired ? (property.permitNotes ? "#permit-notice" : undefined) : "#inquiry"}
                    className="inline-flex items-center gap-2 font-bold text-[13.5px] px-5 py-3 bg-accent border border-accent text-[#0a2a35] hover:brightness-[1.06] transition"
                  >
                    {property.permitRequired
                      ? en
                        ? `${property.permitType || "Filming permit"} required`
                        : `${property.permitType || "撮影許可"}の申請が必要です`
                      : en
                        ? "Contact us"
                        : "お問い合わせ"}
                  </a>
                  {property.contactPhone && !property.permitRequired && (
                    <a
                      href={`tel:${property.contactPhone}`}
                      className="inline-flex items-center gap-2 font-bold text-[13.5px] px-5 py-3 border border-white/40 text-[#fafaf6] hover:border-accent hover:text-accent transition"
                    >
                      {en ? "Call" : "電話する"}{" "}
                      {/* 板が狭い横並びでは番号を省いてタイトル側の幅を確保（tel: リンクなので押せば掛かる） */}
                      <span className="max-lg:@sm:hidden max-lg:@md:inline">{property.contactPhone}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── cover photo ── */}
          <div className="relative min-h-[280px] max-[720px]:min-h-0 max-[720px]:aspect-[16/9] min-[721px]:max-lg:min-h-[460px] lg:min-h-[440px] bg-[#14181c]">
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
            {/* 写真右上の☆は廃止（2026-09-20）: 板の「保存」ボタンに置き換え。同じ状態を持つボタンが
                ヒーロー内に2つあると、片方で保存してももう片方が古い表示のままになるため。 */}
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

            {/* タグ類は概要カードの紹介文の下（2026-09-20 本人指示で仕様カードから移動。NEW・カテゴリ・#タグを1か所に）。 */}
            <ul data-property-tags className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mt-5">
              {isNewProperty(property) && (
                <li className="text-[11px] font-bold px-2.5 py-1 bg-[#e8443a] text-white mono tracking-[0.18em] uppercase">New</li>
              )}
              <li className="text-[12px] font-bold px-2.5 py-1 bg-accent text-[#0a2a35]">{categoryLabel(property.category, locale)}</li>
              {searchTags.map((t) => (
                <li key={t} className="text-[13px] text-ink/60">#{t}</li>
              ))}
            </ul>

            {/* 撮影別の目安＋料金シミュレーション（時間貸しのみ。2026-09-19 本人採用） */}
            {!displaySimulation && (
              <PriceEstimator
                hourlyPrice={property.hourlyPrice}
                minUsageHours={property.minUsageHours}
                dailyPrice={property.dailyPrice}
                priceType={property.priceType}
                ratePlans={property.ratePlans}
                rateSurcharges={property.rateSurcharges}
                taxIncluded={property.taxIncluded}
                openHours={[property.customHoursStart, property.customHoursEnd]}
                en={en}
              />
            )}

            {property.permitRequired && property.permitNotes && (
              <div id="permit-notice" className="mt-6 border border-accent/60 bg-accent/5 px-4 py-3 scroll-mt-20">
                  <p className="text-[12px] text-ink leading-relaxed whitespace-pre-wrap">
                    {property.permitNotes}
                  </p>
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
                      {/* ラベルは「POWER ／ 電源」のバイリンガル書式。EN版は英語部分のみ表示。 */}
                      {en ? (label as string).split(" ／ ")[0] : label}
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

            <PropertyAmenities property={property} en={en} />
            {websiteHref && (
              <p className="mt-4 text-[12.5px] text-ink/60">
                {en ? "For the latest details, see the " : "最新の情報は"}
                <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  {en ? "official website" : "公式サイト"}
                </a>
                {en ? "." : "をご確認ください。"}
              </p>
            )}

            {/* ── 平面図: 仕様カードにまとめる（2026-09-20 本人指示。概要カードは紹介文と料金だけ）。
                 PDF はブラウザ内プレビューが端末差で不安定なため、ダウンロード札のまま ── */}
            {floorPlans.length > 0 && <FloorPlanViewer plans={floorPlans} en={en} />}

            {/* ── mobile-only CTA fallback so #inquiry / bookmark are reachable
                 without needing to scroll all the way to Contact ── */}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
       *  Access — single-marker map + address / station
       * ══════════════════════════════════════════════════ */}
      {mapsUrl && (
        <section className="frame pt-12">
          <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-8">
            <Eyebrow en="ACCESS" jp={en ? "Access" : "アクセス"} />
            <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
              <div className="flex flex-col">
                <div className="space-y-4 text-[15px] flex-1">
                  {property.address && (
                    <div>
                      <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-1">
                        {en ? "Address" : "住所"}
                      </div>
                      <div className="text-[17px] font-bold leading-[1.6]">{property.address}</div>
                    </div>
                  )}
                  {property.nearestStation && (
                    <div>
                      <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-1">
                        {en ? "Nearest station" : "最寄り駅"}
                      </div>
                      <div className="text-[15px] font-medium">{property.nearestStation}</div>
                    </div>
                  )}
                </div>
                {/* 埋め込み地図に「マップで開く」があるため、ボタンは地図を出せない時だけ（2026-09-19 本人指示で削除） */}
                {!mapsEmbedUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 self-start inline-flex items-center min-h-[44px] px-5 font-bold text-[14px] border border-accent text-accent hover:bg-accent hover:text-[#0a2a35] transition"
                  >
                    {en ? "Open in Google Maps →" : "Google マップで開く →"}
                  </a>
                )}
              </div>
              {mapsEmbedUrl && (
                <iframe
                  data-property-map
                  src={mapsEmbedUrl}
                  title={en ? "Map" : "地図"}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="w-full h-[280px] lg:h-full lg:min-h-[280px] border border-line"
                />
              )}
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
            <GalleryLightbox photos={galleryPhotos} en={en} />
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
       *  3DGS — GS-xx mono chrome around untouched ViewerGate
       * ══════════════════════════════════════════════════ */}
      <div className="frame pt-14">
        {property.pageBlocks && property.pageBlocks.length > 0 ? (
          <section className="mb-16">
            {/* 撮影日は登録がある時だけ出す（「未登録」と出さない。2026-09-20 本人指摘） */}
            {visibleSplatItems.length > 0 && property.scannedAt && <p className="text-[13px] text-muted mb-4">{en ? "Captured: " : "撮影日："}{property.scannedAt}</p>}
            <StudioPageBlocks
              blocks={property.pageBlocks}
              property={property}
              freeAccess={freeAccess}
              canViewRestricted={canViewRestricted}
              canViewNdaOnly={canViewNdaOnly}
              hasViewerAccess={hasViewerAccess}
              signedIn={signedIn}
              previewToken={previewToken}
              displaySimulation={displaySimulation}
              freeViewer={isAdminUser}
              unlockedItemIds={unlockedItemIds}
              locale={locale}
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
            {property.scannedAt && <p className="text-[13px] text-muted mb-4">{en ? "Captured: " : "撮影日："}{property.scannedAt}</p>}
            {/* ⚠ 件数に関わらず常に2カラムのグリッドに置く（2026-08-13）。
                以前は1件のときだけ `space-y-10` の全幅にしており、ビューアーが
                `aspect-video` なのでページ幅いっぱい＝縦もページからはみ出す
                大きさになっていた（実測 PC1440 で高さ 760px 超）。複数件のときの
                「左右2分割でちょうどいい」大きさを1件のときの基準にする。
                ただし1件だけを2カラムのまま置くと左半分に寄って右半分が丸ごと
                空くので、その時だけ「1カラム分の幅(= (100% - gap)/2)」を保った
                まま中央へ寄せる。gap-x-8 = 2rem を引いてから半分にしている。 */}
            <div
              className={
                visibleSplatItems.length > 1
                  ? styles.legacySceneGrid
                  : styles.legacySingleScene
              }
            >
              {visibleSplatItems.map(({ it: item, origIndex }, i) => {
                // 限定無料期間はアイテム単位(item.freePeriod)。sharePreview(先方
                // 共有プレビュー)は購入導線自体を出さない仕様のためここで force。
                const itemDataSaleFree = isDataSaleFree(item.freePeriod, nowIso);
                const itemDataSaleDisabled = sharePreview || isDataSaleDisabled(item.freePeriod, nowIso);
                return (
                /* 縦の上限をビューポート高で縛る。ビューアーは aspect-video なので
                   「高さの上限」は幅の上限として書くしかない（max-h では中の
                   aspect-video が縮まずはみ出す）。--z は html の zoom なので
                   実画面基準の vh は必ず var(--z) で割る（CLAUDE.md の規約）。
                   高さ 45vh 相当 → 幅 45vh × 16/9。 */
                <section key={origIndex} data-scene-card={item.id} id={i === initialSceneIndex ? "walkthrough" : `scene-${origIndex}`} className={styles.legacyScene}>
                  <div className="flex flex-wrap items-baseline gap-3 mb-4 mono text-[11px] tracking-[0.16em] uppercase">
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
                    previewToken={previewToken}
                    displaySimulation={displaySimulation}
                    freeViewer={isAdminUser}
                    alreadyUnlocked={unlockedItemIds.includes(item.id)}
                  />
                  {/* 販売中でも配布ファイルが未設定の項目は「購入する」を出さない。
                      出すと必ずサーバ側 409 になる壊れた導線になる（購入ゲートと整合）。
                      salePrice===0 は「無料配布」として許可する（api/purchase 側で
                      Stripe を経由せず即時完了する）。itemDataSaleDisabled は
                      このアイテムの限定無料期間終了後に「販売停止」を選んだ場合、
                      またはsharePreview時に、パネル自体を出さない。 */}
                  {item.forSale && !itemDataSaleDisabled && resolveDownloadFiles(item).length > 0 && (
                    <DataSalePanel
                      propertyId={property.id}
                      propertyTitle={property.title}
                      splatItemIndex={origIndex}
                      itemLabel={item.label}
                      licenseOptions={resolveLicenseOptions(item).map((o) => ({
                        ...o,
                        price: itemDataSaleFree ? 0 : o.price,
                      }))}
                      description={item.saleDescription}
                      scannedAt={property.scannedAt}
                      splatSizeMb={item.sizeMb}
                      zipSizeMb={property.zipSizeMb}
                      splatItemCount={property.splatItems.length}
                      tokenCost={property.tokenCost as TokenCost}
                      purchaseContents={resolvePurchaseContents(item)}
                      captureDevice={item.captureDevice}
                      alreadyPurchased={purchasedItemIds.includes(item.id)}
                      displaySimulation={displaySimulation}
                      editorialRightsCredit={item.editorialRightsCredit}
                      usageRestrictions={item.usageRestrictions}
                    />
                  )}
                  {item.forSale && !itemDataSaleDisabled && resolveDownloadFiles(item).length === 0 && (
                    <PurchaseContents files={resolvePurchaseContents(item)} en={en} />
                  )}
                </section>
                );
              })}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════
         *  Community — CONTACT（常設）。掲示板・通報は 2026-09-19 本人指示で廃止。
         *  常設の黒アクションバー（保存・問い合わせボタンだけの帯）は不要と
         *  判断され撤去。CONTACTカードは元通り常時表示に戻し、問い合わせ先が
         *  無い物件はカード内に「受け付けていません」の文言＋★保存だけ出す。
         * ══════════════════════════════════════════════════ */}
        {/* 管理プレビューでも欄は出す（ヒーローの「お問い合わせ」の飛び先が無くなるため。2026-09-20）。
            ただし実データを作らないよう、フォームと保存ボタンはプレビューでは動かさない。 */}
        {(
          <section id="inquiry" className="mb-14 scroll-mt-24">
            <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-9">
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
                        className="font-bold border-b border-ink/30 max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px] hover:text-accent hover:border-accent transition"
                      >
                        {property.contactPhone}
                      </a>
                    </div>
                  )}
                  {displayedEmail && (
                    <div className="flex gap-5 py-3 border-b border-line">
                      <span className="mono text-[10px] tracking-[0.22em] uppercase text-muted w-[54px] pt-0.5 shrink-0">
                        MAIL
                      </span>
                      <a
                        href={`mailto:${displayedEmail}`}
                        className="font-bold border-b border-ink/30 max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px] hover:text-accent hover:border-accent transition break-all"
                      >
                        {displayedEmail}
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
                        className="font-bold border-b border-ink/30 max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px] hover:text-accent hover:border-accent transition break-all"
                      >
                        {en ? "Official site →" : "公式サイト →"}
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
                  {preview ? (
                    <div className="border border-dashed border-line text-[13px] text-muted text-center py-4 px-3 rounded-md">
                      {en ? "Inquiry form and save button appear here (disabled in preview)." : "ここに問い合わせフォームと保存ボタンが出ます（プレビューでは動きません）"}
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            </div>

          </section>
        )}

        {/* 管理プレビュー時はコミュニティ（問い合わせ）を
            出さない（実データ・実操作を伴うため）。プレビューは物件情報の
            確認に専念させる。 */}

        {/* ══════════════════════════════════════════════════
         *  Related studios（共有プレビューでは非表示 — 確認対象の物件に専念）
         * ══════════════════════════════════════════════════ */}
        {/* ⚠ 類似スタジオが1件も無いときは、セクションごと出さない（2026-08-13）。
            以前は「掲載準備中です」の破線ボックスを出していたが、ページ末尾に
            中身の無い枠が居座るだけで邪魔だという運用判断。 */}
        {!sharePreview && others.length > 0 && (
        <section className="mb-20">
          <Eyebrow en="RELATED" jp={en ? "Similar studios" : "類似スタジオ"} />
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
                    <h3 className="ui-card-title group-hover:text-accent transition">
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
        </section>
        )}
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
