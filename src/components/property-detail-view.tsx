import Link from "next/link";
import PropertySceneWorkspace, { PropertySceneProvider } from "./property-scene-workspace";
import PropertyPhotoGallery from "./property-photo-gallery";
import PropertyLicenseDetails from "./property-license-details";
import styles from "./property-detail-view.module.css";
import {
  categoryLabel,
  isNewProperty,
  type Property,
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
import { googleMapsUrl, publicPropertyEmail, propertyTitleSegments } from "@/lib/property-presentation";
import PropertyComments, { type CommentItem } from "@/components/property-comments";

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
    <h2 className="ui-section-title text-ink mb-4">
      {jp}
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
              <h3 className="ui-card-title text-ink mb-2.5 flex items-center gap-2.5">
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
  comments = [],
  currentUserId = null,
  currentUserName = null,
  isAdminUser = false,
  canPostBoard = false,
}: {
  property: Property;
  others: Property[];
  preview?: boolean;
  /** Admin-only visual simulation: no real viewing, checkout, or cart mutations. */
  displaySimulation?: boolean;
  /** 先方スタジオ共有用の限定プレビュー(ログイン不要)。掲示板/購入/関連を抑制し、
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
  /** 会員限定掲示板の初期コメント一覧。 */
  comments?: CommentItem[];
  currentUserId?: string | null;
  currentUserName?: string | null;
  isAdminUser?: boolean;
  /** 掲示板への書き込み権限（有料プラン: Individual / Studio / Team / admin）。閲覧は会員全員。 */
  canPostBoard?: boolean;
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

  // 写真は3DGSと独立したギャラリーにまとめる。カバーを含め重複srcは除外。
  const seen = new Set<string>();
  const galleryPhotos = [property.cover, ...property.gallery].filter((p) => {
    if (!p?.src || seen.has(p.src)) return false;
    seen.add(p.src);
    return true;
  });

  // 公開用連絡先と、実際の住所・座標に基づくアクセスリンク。
  const displayedEmail = publicPropertyEmail(property.id, property.contactEmail);
  const mapsUrl = googleMapsUrl(property.coords, property.address);

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

  // ── Pricing / Rules セクションの表示可否（横並び2カラム化の判定に使う） ──
  const showPricing =
    property.minUsageHours > 0 || !!property.scoutingFee || !!property.extraFees;
  const showRules =
    !!property.prohibitedItems ||
    !!property.cancellationPolicy ||
    property.insuranceRequired ||
    property.attendanceRequired;

  return (
    <PropertySceneProvider><article className={`theme-online ${styles.page}`}>
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
      <div className="frame pt-4">
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
       *  Property heading and location actions, separate from photos and 3DGS.
       * ══════════════════════════════════════════════════ */}
      <div className="frame">
        <header className={styles.title}>
          <div className={styles.titleBody}>
              <h1 className="text-[24px] lg:text-[32px] font-bold leading-[1.34] mt-6 mb-1.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {propertyTitleSegments(property.title || (en ? "(Untitled location)" : "（無題の物件）")).map((part, index) => (
                  part.includes("\n") ? <br key={index} /> : <span key={index} className="inline-block max-w-full align-baseline [overflow-wrap:anywhere]">{part}</span>
                ))}
              </h1>
              <div className={styles.titleMeta}>
              <p className="text-[13px] text-muted">
                {property.prefecture} {property.city}
              </p>
              <div className="flex flex-wrap gap-1.5">
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
                      className="text-[11px] font-bold px-3 py-1 border border-line text-muted"
                    >
                      {t}
                    </span>
                  ));
                })()}
              </div>
              </div>

              <div className={styles.titleActions}>
                {!preview && <BookmarkButton propertyId={property.id} initialBookmarked={bookmarked} signedIn={signedIn} revalidate={`/properties/${property.id}`} />}
                {!(property.permitRequired && property.priceType === "flat" && property.hourlyPrice === 0) && <p className="mono text-[24px] mb-3.5">
                  {property.priceType === "free" ? (
                    <small className="text-[13px] text-muted tracking-[0.1em]">
                      {en ? "Free" : "無料"}
                    </small>
                  ) : property.priceType === "flat" ? (
                    property.hourlyPrice > 0 ? (
                      <>
                        ¥{yen}{" "}
                        <small className="text-[11px] text-muted tracking-[0.16em]">
                          {en ? "(permit fee)" : "（撮影許可）"}
                        </small>
                      </>
                    ) : (
                      <small className="text-[13px] text-muted tracking-[0.1em]">
                        {en
                          ? `${property.permitType || "Filming permit"} required`
                          : `${property.permitType || "撮影許可"}の申請が必要です`}
                      </small>
                    )
                  ) : property.hourlyPrice > 0 ? (
                    <>
                      ¥{yen}{" "}
                      <small className="text-[11px] text-muted tracking-[0.16em]">/HR</small>
                    </>
                  ) : (
                    <small className="text-[13px] text-muted tracking-[0.1em]">
                      {en ? "Contact for pricing" : "お問い合わせください"}
                    </small>
                  )}
                </p>}
                {property.priceType === "hourly" && property.dailyPrice > 0 && (
                  <p className="mono text-[11px] text-muted mb-4 -mt-2">
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
                        ? `${property.permitType || "Filming permit"} required`
                        : `${property.permitType || "撮影許可"}の申請が必要です`
                      : en
                        ? "Contact us"
                        : "お問い合わせ"}
                  </a>
                </div>
              </div>
          </div>

        </header>
      </div>

      <section data-property-top className={`frame ${styles.top}`}>
        <PropertyPhotoGallery photos={galleryPhotos} en={en} scannedAt={property.scannedAt} />
        {!(property.pageBlocks && property.pageBlocks.length > 0) && <div><PropertySceneWorkspace en={en} labels={visibleSplatItems.map(({ it }, index) => it.label || `${en ? "Scene" : "シーン"} ${index + 1}`)}>
          {visibleSplatItems.map(({it:item,origIndex}) => {
            const itemDataSaleFree = isDataSaleFree(item.freePeriod, nowIso);
            const itemDataSaleDisabled = sharePreview || isDataSaleDisabled(item.freePeriod, nowIso);
            return <div key={origIndex}>                  {item.forSale && !itemDataSaleDisabled && (
                  <div data-property-purchase className={styles.purchase}>
                  {/* 販売中でも配布ファイルが未設定の項目は「購入する」を出さない。
                      出すと必ずサーバ側 409 になる壊れた導線になる（購入ゲートと整合）。
                      salePrice===0 は「無料配布」として許可する（api/purchase 側で
                      Stripe を経由せず即時完了する）。itemDataSaleDisabled は
                      このアイテムの限定無料期間終了後に「販売停止」を選んだ場合、
                      またはsharePreview時に、パネル自体を出さない。 */}
                  {item.forSale && !itemDataSaleDisabled && resolveDownloadFiles(item).length > 0 && (
                    <DataSalePanel
                      propertyPresentation
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
                      tokenCost={property.tokenCost as 1 | 2 | 3 | 5}
                      purchaseContents={resolvePurchaseContents(item)}
                      captureDevice={item.captureDevice}
                      alreadyPurchased={purchasedItemIds.includes(item.id)}
                      displaySimulation={displaySimulation}
                      editorialRightsCredit={item.editorialRightsCredit}
                    />
                  )}
                  {item.forSale && !itemDataSaleDisabled && resolveDownloadFiles(item).length === 0 && (
                    <PurchaseContents files={resolvePurchaseContents(item)} en={en} />
                  )}
                  </div>
                  )}

              {(!item.forSale || itemDataSaleDisabled) && <div className={styles.purchase}><h2>{en ? "3D scene" : "3Dシーン"}</h2><p>{en ? "Data purchase is not available for this scene." : "このシーンのデータ販売は行っていません。"}</p><a href="#walkthrough">{en ? "View walkthrough ↓" : "ウォークスルーを見る ↓"}</a></div>}
            </div>;
          })}
        </PropertySceneWorkspace></div>}
      </section>
      <section data-property-facts className={`frame ${styles.facts}`}>
        <div data-property-access className={styles.info}>
          <h2>{en ? "Access and facilities" : "アクセス・施設情報"}</h2>
          {renderOverview(property.description)}
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
                      {(label as string).split(" ／ ")[en ? 0 : 1] || label}
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


          {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer">{en ? "Open in Google Maps →" : "Google Maps で開く →"}</a>}
          <p className="text-[13px] text-muted mt-4">{en ? "Ceiling: " : "天井高："}{isOutdoorProperty ? (en ? "Outdoor" : "屋外") : property.ceilingHeightM ? `${property.ceilingHeightM} m` : "—"}{!isOutdoorProperty && ` / ${en ? "Natural light: " : "自然光："}${property.hasNaturalLight ? (en ? "Yes" : "あり") : (en ? "No" : "なし")}`}</p>
        </div>
        <div data-property-contact id="inquiry" className={styles.info}>
          <h2>{en ? "Filming permits and inquiries" : "撮影許可・お問い合わせ"}</h2>
          {property.permitRequired && <div id="permit-notice" className={styles.permit}><p>{property.permitNotes || (en ? `${property.permitType || "Filming permit"} required` : `${property.permitType || "撮影許可"}の申請が必要です`)}</p></div>}
          {!preview && <>            <div>

              <div className="space-y-4">
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
                </div>
              </div>
            </div>

</>}
        </div>
      </section>
      <section id="walkthrough" data-property-3dgs data-property-workspace className={`frame ${styles.workspace}`} aria-label={en ? "3DGS viewing and data purchase" : "3DGS表示とデータ購入"}>
        {property.pageBlocks && property.pageBlocks.length > 0 ? (
          <section className="mb-7">
            {visibleSplatItems.length > 0 && <p className="text-[13px] text-muted mb-4">{en ? "Captured: " : "撮影日："}{property.scannedAt || (en ? "Not registered" : "未登録")}</p>}
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
          <section className="mb-7">
            <Eyebrow en="3DGS" jp={en ? "Walkthrough" : "ウォークスルー"} />
            <div className="border border-dashed border-line py-16 text-center bg-white">
              <p className="text-ink/40 text-[14px]">
                {en ? "3DGS data is coming soon." : "3DGSデータは準備中です。"}
              </p>
            </div>
          </section>
        ) : (
          <section className="mb-7">
            <Eyebrow en="3DGS" jp={en ? "Walkthrough" : "ウォークスルー"} />
            <p className="text-[13px] text-muted mb-4">{en ? "Captured: " : "撮影日："}{property.scannedAt || (en ? "Not registered" : "未登録")}</p>
            <PropertySceneWorkspace en={en} labels={visibleSplatItems.map(({ it }, index) => it.label || `${en ? "Scene" : "シーン"} ${index + 1}`)}>
              {visibleSplatItems.map(({ it: item, origIndex }) => {
                return (
                <section key={origIndex} data-property-scene className={styles.scene}>
                  <div data-property-viewing className={styles.viewing}>
                  <div className={styles.viewingHeader}>
                    <h3>{item.label || (en ? "3DGS walkthrough" : "3DGSウォークスルー")}</h3>
                    <span>{item.sizeMb} MB</span>
                  </div>
                  <div className={styles.viewport} data-has-preview={!!item.previewVideoUrl}>
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
                  </div>
                  </div>
                </section>
                );
              })}
            </PropertySceneWorkspace>
          </section>
        )}
      </section>


      <section id="license-details" data-property-license-details data-property-license className={`frame ${styles.licenseSection}`}>
        {!(property.pageBlocks && property.pageBlocks.length > 0) && <PropertySceneWorkspace en={en} showPicker={false} labels={visibleSplatItems.map(({ it }, index) => it.label || `${en ? "Scene" : "シーン"} ${index + 1}`)}>
          {visibleSplatItems.map(({it:item,origIndex}) => <div key={origIndex}>{item.forSale && !sharePreview && !isDataSaleDisabled(item.freePeriod, nowIso) && <PropertyLicenseDetails options={resolveLicenseOptions(item)} en={en}/>}</div>)}
        </PropertySceneWorkspace>}
      </section>

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

      <div className="frame pt-8">


        {/* ══════════════════════════════════════════════════
         *  Community — CONTACT（常設）＋ 掲示板
         *  常設の黒アクションバー（保存・問い合わせボタンだけの帯）は不要と
         *  判断され撤去。CONTACTカードは元通り常時表示に戻し、問い合わせ先が
         *  無い物件はカード内に「受け付けていません」の文言＋★保存だけ出す。
         * ══════════════════════════════════════════════════ */}
        {!preview && (
          <section className="mb-14">
            {/* 掲示板 */}
            <div className="bg-white border border-line shadow-[0_1px_3px_rgba(20,24,28,0.04)] px-7 py-8 sm:px-9">
              <Eyebrow
                en="BOARD"
                jp={
                  en
                    ? "Board (viewing: everyone / posting: paid plans)"
                    : "掲示板（閲覧: 全員 / 書き込み: 有料プラン）"
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
          </section>
        )}

        {/* 管理プレビュー時はコミュニティ（アクションバー/掲示板）を
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
    </article></PropertySceneProvider>
  );
}
