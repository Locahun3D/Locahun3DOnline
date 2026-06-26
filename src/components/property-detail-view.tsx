import Link from "next/link";
import {
  CATEGORY_LABEL,
  TOKEN_COST_LABEL,
  PLAN_TOKEN_BUDGET,
  type Property,
} from "@/lib/schemas";
import ViewerGate from "@/components/viewer-gate";
import DataSalePanel from "@/components/data-sale-panel";
import StudioPageBlocks from "@/components/studio/studio-page-blocks";
import BookmarkButton from "@/components/bookmark-button";

export default function PropertyDetailView({
  property,
  others,
  preview = false,
  freeAccess = false,
  canViewRestricted = false,
  canViewNdaOnly = false,
  purchasedIndices = [],
  hasViewerAccess = false,
  signedIn = false,
  bookmarked = false,
}: {
  property: Property;
  others: Property[];
  preview?: boolean;
  freeAccess?: boolean;
  canViewRestricted?: boolean;
  canViewNdaOnly?: boolean;
  purchasedIndices?: number[];
  hasViewerAccess?: boolean;
  signedIn?: boolean;
  bookmarked?: boolean;
}) {
  const yen = property.hourlyPrice.toLocaleString("ja-JP");

  const visibleSplatItems = property.splatItems.filter((it) => {
    if (!it.splatUrl) return false;
    if (it.accessLevel === "restricted" && !canViewRestricted) return false;
    if (it.accessLevel === "nda_only" && !canViewNdaOnly) return false;
    return true;
  });

  return (
    <article className="theme-online">
      {preview && (
        <div className="frame mb-0 border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-[13px] mono tracking-[0.08em] text-amber-300 flex flex-wrap items-center justify-between gap-3">
          <span>
            ● 管理プレビュー — ステータス:{" "}
            <strong className="uppercase">{property.status}</strong>
            （未公開でもこの画面で確認できます）
          </span>
          <Link
            href={`/admin/properties/${property.id}/edit`}
            className="underline hover:text-amber-200"
          >
            ← 編集に戻る
          </Link>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
       *  Cinematic Hero — full-width cover + dark gradient overlay
       * ══════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ height: "clamp(340px, 40vw, 520px)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={property.cover.src}
          alt={property.cover.alt}
          className="absolute inset-0 w-full h-full object-cover object-[center_28%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />

        <div className="absolute inset-0 flex flex-col justify-end frame pb-10 sm:pb-14">
          <nav className="mono text-[11px] tracking-[0.28em] uppercase text-white/50 mb-4 flex gap-2 items-center">
            <Link href="/properties" className="hover:text-white/80 transition">
              CATALOG
            </Link>
            <span>/</span>
            <span>{CATEGORY_LABEL[property.category]}</span>
            <span>/</span>
            <span>{property.id.toUpperCase()}</span>
          </nav>

          <div className="mono text-[12px] tracking-[0.2em] uppercase text-white/60 mb-2">
            {property.prefecture} {property.city}
            {property.studioType && (
              <span className="ml-3 text-white/40">{property.studioType}</span>
            )}
          </div>

          <h1 className="serif text-[clamp(1.6rem,4vw,2.8rem)] font-bold leading-[1.25] text-white max-w-[900px]">
            {property.title || "（無題の物件）"}
          </h1>

          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-1">
              <span className="serif text-3xl sm:text-4xl text-accent font-bold">
                ¥{yen}
              </span>
              <span className="mono text-[11px] text-white/50">/hr</span>
            </div>
            {property.dailyPrice > 0 && (
              <div className="mono text-[12px] text-white/60">
                日貸し ¥{property.dailyPrice.toLocaleString("ja-JP")}/day
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 sm:ml-auto">
              {property.tags.map((t) => (
                <span
                  key={t}
                  className="mono text-[10px] tracking-[0.12em] uppercase bg-white/15 backdrop-blur-sm text-white/80 px-2.5 py-1 rounded-sm"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Top-right actions on the hero */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-8 flex items-center gap-2.5">
          {!preview && (
            <BookmarkButton
              propertyId={property.id}
              initialBookmarked={bookmarked}
              signedIn={signedIn}
              revalidate={`/properties/${property.id}`}
              variant="hero"
            />
          )}
          <button
            type="button"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-[13px] tracking-[0.04em] bg-accent text-black font-bold shadow-lg hover:bg-accent/90 transition rounded-sm"
          >
            <span className="text-[15px] leading-none">✎</span>
            見積もり依頼
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
       *  Dashboard body
       * ══════════════════════════════════════════════════ */}
      <div className="frame pt-6 pb-16">
        {/* ── Gallery — Airbnb 風（主1 + サムネ）。多様な幅/解像度/アスペクト比の
             写真も object-cover でセル比率に統一トリミング。写真がカバー1枚だけ
             ならヒーローで足りるため非表示。 ── */}
        {(() => {
          const photos = [property.cover, ...property.gallery].filter(
            (p) => p?.src,
          );
          const total = photos.length;
          if (total <= 1) return null;

          // 画像1枚分。どんなアスペクト比でもセルを object-cover で埋める。
          const img = (p: { src: string; alt: string }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.src}
              alt={p.alt}
              className="w-full h-full object-cover object-center"
            />
          );

          // 2枚: 2カラム
          if (total === 2) {
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-lg overflow-hidden mb-8">
                {photos.map((p, i) => (
                  <div
                    key={i}
                    className="aspect-[16/10] sm:aspect-auto sm:h-[clamp(280px,32vw,460px)] overflow-hidden"
                  >
                    {img(p)}
                  </div>
                ))}
              </div>
            );
          }

          // 3枚: 主1（左・2行分）+ 右2枚
          if (total === 3) {
            return (
              <div className="grid grid-cols-2 sm:grid-cols-[1.5fr_1fr] sm:grid-rows-2 gap-1.5 rounded-lg overflow-hidden mb-8 h-auto sm:h-[clamp(300px,36vw,480px)]">
                <div className="col-span-2 sm:col-span-1 sm:row-span-2 aspect-[16/10] sm:aspect-auto overflow-hidden">
                  {img(photos[0])}
                </div>
                {photos.slice(1).map((p, i) => (
                  <div key={i} className="aspect-[4/3] sm:aspect-auto overflow-hidden">
                    {img(p)}
                  </div>
                ))}
              </div>
            );
          }

          // 4枚以上: Airbnb 5グリッド（主1 + サムネ4スロット）。スロットが余る
          // 場合は「すべての写真」プレースホルダで埋める（2枚目スクショの形）。
          const grid5 = photos.slice(0, 5);
          return (
            <div className="grid grid-cols-2 sm:grid-cols-[1fr_0.5fr_0.5fr] sm:grid-rows-2 gap-1.5 rounded-lg overflow-hidden mb-8 h-auto sm:h-[clamp(320px,38vw,540px)]">
              <div className="col-span-2 sm:col-span-1 sm:row-span-2 aspect-[16/10] sm:aspect-auto overflow-hidden">
                {img(grid5[0])}
              </div>
              {[1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  className="relative aspect-square sm:aspect-auto overflow-hidden"
                >
                  {grid5[idx] ? (
                    <>
                      {img(grid5[idx])}
                      {idx === 4 && total > 5 && (
                        <button
                          type="button"
                          className="absolute bottom-3 right-3 bg-white/95 text-ink/80 text-[13px] font-medium px-4 py-2 rounded-md shadow-sm border border-line hover:bg-white transition"
                        >
                          すべての写真 ({total})
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full bg-ink/[0.05] flex items-center justify-center">
                      <span className="text-[13px] text-ink/45 font-medium">
                        すべての写真 ({total})
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Description + Spec/Contact sidebar ── */}
        <div className="grid lg:grid-cols-3 gap-6 mb-10">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="mono text-[11px] tracking-[0.14em] uppercase text-ink/60 mb-2.5 font-semibold">
                概要
              </div>
              <p className="text-[16px] leading-[1.95] text-ink/90 whitespace-pre-line">
                {property.description}
              </p>
            </div>

            {/* ── 4-column metric cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border border-line rounded-md p-4">
                <div className="mono text-[11px] tracking-[0.14em] uppercase text-ink/60 mb-1.5 font-semibold">
                  面積
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="serif text-[28px] md:text-[32px] leading-none font-semibold">
                    {property.floorAreaSqm}
                  </span>
                  <span className="text-[13px] text-ink/65">㎡</span>
                </div>
              </div>

              <div className="border border-line rounded-md p-4">
                <div className="mono text-[11px] tracking-[0.14em] uppercase text-ink/60 mb-1.5 font-semibold">
                  天井高
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="serif text-[28px] md:text-[32px] leading-none font-semibold">
                    {property.ceilingHeightM || "—"}
                  </span>
                  <span className="text-[13px] text-ink/65">m</span>
                </div>
              </div>

              <div className="border border-line rounded-md p-4">
                <div className="mono text-[11px] tracking-[0.14em] uppercase text-ink/60 mb-1.5 font-semibold">
                  収容
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="serif text-[28px] md:text-[32px] leading-none font-semibold">
                    {property.capacity}
                  </span>
                  <span className="text-[13px] text-ink/65">名</span>
                </div>
              </div>

              <div className="border border-line rounded-md p-4">
                <div className="mono text-[11px] tracking-[0.14em] uppercase text-ink/60 mb-1.5 font-semibold">
                  自然光
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="serif text-[28px] md:text-[32px] leading-none font-semibold">
                    {property.hasNaturalLight ? "あり" : "なし"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar: CTA + specs + blueprints */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {/* ── CTA card (accent) ── */}
            <div className="rounded-lg overflow-hidden shadow-sm border border-accent/20">
              <div className="bg-accent px-5 py-4">
                <div className="text-[11px] font-bold tracking-[0.15em] text-white/80 mb-1">
                  お問い合わせ
                </div>
                {property.contactPhone && (
                  <a
                    href={`tel:${property.contactPhone}`}
                    className="flex items-center gap-2 text-white"
                  >
                    <span className="text-[11px] font-bold tracking-wider">TEL</span>
                    <span className="text-[22px] font-bold tracking-wide leading-none">
                      {property.contactPhone}
                    </span>
                  </a>
                )}
              </div>
              <div className="bg-white px-5 py-4 space-y-3">
                <a
                  href="#inquiry-form"
                  className="block w-full bg-ink text-white text-center text-[14px] font-medium py-3.5 rounded-md hover:bg-ink/85 transition"
                >
                  フォームからお問い合わせ
                </a>
                <div className="flex items-center gap-2">
                  {property.contactEmail && (
                    <a
                      href={`mailto:${property.contactEmail}`}
                      className="flex-1 flex items-center justify-center gap-1.5 text-[12px] text-ink/60 border border-line rounded-md py-2 hover:border-accent hover:text-accent transition"
                    >
                      <span>✉</span>
                      <span>メール</span>
                    </a>
                  )}
                  {property.contactWebsite && (
                    <a
                      href={
                        /^https?:\/\//.test(property.contactWebsite)
                          ? property.contactWebsite
                          : `https://${property.contactWebsite}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 text-[12px] text-ink/60 border border-line rounded-md py-2 hover:border-accent hover:text-accent transition"
                    >
                      <span>↗</span>
                      <span>HP</span>
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-line">
                  <BookmarkButton
                    propertyId={property.id}
                    initialBookmarked={bookmarked}
                    signedIn={signedIn}
                    revalidate={`/properties/${property.id}`}
                  />
                </div>
              </div>
            </div>

            {/* ── Specs ── */}
            <div className="border border-line rounded-md overflow-hidden">
              <div className="bg-ink/[0.03] px-4 py-2.5 border-b border-line">
                <span className="mono text-[11px] tracking-[0.14em] uppercase text-ink/60 font-semibold">
                  スペック
                </span>
              </div>
              <table className="w-full text-[14px]">
                <tbody>
                  {[
                    ["電源", property.powerVoltage || "—"],
                    ["駐車場", property.parking ? "利用可" : "なし"],
                    ["搬入口", property.loadingDock ? "大型搬入可" : "通常"],
                    ["スキャン日", property.scannedAt || "—"],
                  ].map(([label, value]) => (
                    <tr key={label} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 mono text-[11px] tracking-[0.1em] uppercase text-ink/60 font-semibold w-[100px]">
                        {label}
                      </td>
                      <td className="px-4 py-3 text-[14px] text-ink/90 font-medium">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Blueprints ── */}
            {property.blueprints &&
              property.blueprints.length > 0 &&
              property.blueprints.some((b) => b.url) && (
                <div className="border border-line rounded-md overflow-hidden">
                  <div className="bg-ink/[0.03] px-4 py-2.5 border-b border-line">
                    <span className="mono text-[11px] tracking-[0.14em] uppercase text-ink/60 font-semibold">
                      図面 / フロアプラン
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    {property.blueprints
                      .filter((b) => b.url)
                      .map((b, i) => (
                        <a
                          key={i}
                          href={b.url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-[13px] border border-line px-3 py-2.5 rounded-sm hover:border-accent hover:text-accent transition"
                        >
                          <span className="text-accent">⬇</span>
                          <span className="flex-1 truncate text-[14px] text-ink/90 font-medium">
                            {b.label || `図面 ${i + 1}`}
                          </span>
                          <span className="mono text-[10px] tracking-[0.12em] uppercase text-ink/55 font-semibold">
                            DL
                          </span>
                        </a>
                      ))}
                  </div>
                </div>
              )}
          </aside>
        </div>

        {/* ── Content sections (3DGS / Gallery / Page blocks) ── */}
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
            />
          </section>
        ) : (
          <>
            {visibleSplatItems.map((item, idx) => (
              <section key={idx} className="mb-12">
                <div className="chapter-rule">
                  <span className="text-ink/50">3DGS</span>
                  <span className="text-ink/80">
                    {item.label || "Virtual Walkthrough"}
                  </span>
                  <span className="flex-1 h-px bg-current opacity-25" />
                  <span className="text-ink/50">{item.sizeMb} MB</span>
                </div>
                <ViewerGate
                  splatUrl={item.splatUrl}
                  propertyId={property.id}
                  label={item.label || `#${idx + 1}`}
                  sizeMb={item.sizeMb}
                  previewVideoUrl={item.previewVideoUrl}
                  tokenCost={property.tokenCost}
                  freeAccess={freeAccess}
                  hasSubscription={hasViewerAccess}
                  signedIn={signedIn}
                />
                {item.forSale && item.salePrice > 0 && (
                  <DataSalePanel
                    propertyId={property.id}
                    propertyTitle={property.title}
                    splatItemIndex={idx}
                    itemLabel={item.label}
                    price={item.salePrice}
                    description={item.saleDescription}
                    scannedAt={property.scannedAt}
                    splatSizeMb={item.sizeMb}
                    zipSizeMb={property.zipSizeMb}
                    splatItemCount={property.splatItems.length}
                    tokenCost={property.tokenCost as 1 | 2 | 3}
                    downloadFileFormat={item.downloadFileFormat}
                    downloadFileSizeMb={item.downloadFileSizeMb}
                    pointCount={item.pointCount}
                    captureDevice={item.captureDevice}
                    license={item.license}
                    alreadyPurchased={purchasedIndices.includes(idx)}
                  />
                )}
              </section>
            ))}

          </>
        )}

        {/* ── Inquiry form ── */}
        <section id="inquiry-form" className="mt-16 mb-16 scroll-mt-24">
          <div className="chapter-rule">
            <span className="text-accent font-medium">CONTACT</span>
            <span className="text-ink/80">スタジオへのお問い合わせ</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>

          {/* フォームは全幅に広げず読みやすい幅に収める（操作性向上） */}
          <div className="border border-line rounded-lg overflow-hidden max-w-[760px]">
            {/* Form header */}
            <div className="bg-accent px-6 py-4">
              <h3 className="text-white text-[16px] font-bold">
                {property.title} に問い合わせる
              </h3>
              <p className="text-white/70 text-[13px] mt-1">
                下記フォームにご記入ください。担当者より折り返しご連絡いたします。
              </p>
            </div>

            <form className="bg-white p-6 space-y-5" action="#inquiry-form" method="GET">
              {/* 2-col: name + company */}
              <div className="grid md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
                    お名前 <span className="text-red-500 text-[11px]">必須</span>
                  </span>
                  <input
                    type="text"
                    placeholder="山田 太郎"
                    required
                    className="w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
                    会社名
                  </span>
                  <input
                    type="text"
                    placeholder="株式会社〇〇"
                    className="w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                  />
                </label>
              </div>

              {/* 2-col: email + phone */}
              <div className="grid md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
                    メールアドレス <span className="text-red-500 text-[11px]">必須</span>
                  </span>
                  <input
                    type="email"
                    placeholder="info@example.com"
                    required
                    className="w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
                    電話番号
                  </span>
                  <input
                    type="tel"
                    placeholder="090-0000-0000"
                    className="w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                  />
                </label>
              </div>

              {/* 2-col: purpose + date */}
              <div className="grid md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
                    利用目的 <span className="text-red-500 text-[11px]">必須</span>
                  </span>
                  <select
                    required
                    className="w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] bg-white focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                    defaultValue=""
                  >
                    <option value="" disabled>選択してください</option>
                    <option>スチール撮影</option>
                    <option>ムービー / CM撮影</option>
                    <option>ロケハン（内見）</option>
                    <option>イベント / 展示会</option>
                    <option>その他</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
                    利用希望日
                  </span>
                  <input
                    type="date"
                    className="w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                  />
                </label>
              </div>

              {/* Message */}
              <label className="block">
                <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
                  お問い合わせ内容 <span className="text-red-500 text-[11px]">必須</span>
                </span>
                <textarea
                  rows={4}
                  required
                  placeholder="ご利用時間、人数、搬入物の有無など詳細をお聞かせください"
                  className="w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] leading-relaxed resize-y focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                />
              </label>

              {/* Submit — stack on mobile so the button isn't squeezed by the note */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-2">
                <button
                  type="submit"
                  className="w-full sm:w-auto bg-accent text-white text-[15px] font-bold px-8 py-3.5 rounded-md hover:bg-accent/85 transition shadow-sm"
                >
                  送信する
                </button>
                <span className="text-[12px] text-ink/40">
                  ※ 送信後、担当者より1営業日以内にご連絡いたします
                </span>
              </div>
            </form>
          </div>
        </section>

        {/* ── Related studios ── */}
        <section className="mt-8">
          <div className="chapter-rule">
            <span className="text-ink/50">RELATED</span>
            <span className="text-ink/80">類似スタジオ</span>
            <span className="flex-1 h-px bg-current opacity-25" />
          </div>
          {others.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-6">
              {others.map((p) => (
                <Link
                  key={p.id}
                  href={`/properties/${p.id}`}
                  className="group block border border-line rounded-md overflow-hidden hover:border-accent transition"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.cover.src}
                    alt={p.cover.alt}
                    className="w-full aspect-[16/10] object-cover"
                  />
                  <div className="p-4 space-y-1.5">
                    <div className="mono text-[10px] tracking-[0.22em] uppercase text-ink/45 font-medium">
                      {p.area} · {p.city}
                    </div>
                    <div className="serif text-[15px] text-ink/85 group-hover:text-accent transition leading-snug">
                      {p.title}
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-ink/50 mt-2">
                      {p.floorAreaSqm > 0 && <span>{p.floorAreaSqm} m²</span>}
                      {p.ceilingHeightM > 0 && <span>天井 {p.ceilingHeightM}m</span>}
                      {p.hourlyPrice > 0 && (
                        <span className="ml-auto font-medium text-ink/70">
                          ¥{p.hourlyPrice.toLocaleString()}/h
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-line rounded-md py-16 text-center">
              <p className="text-ink/40 text-[14px]">
                現在、類似スタジオの掲載準備中です
              </p>
              <Link
                href="/properties"
                className="inline-block mt-4 mono text-[12px] tracking-[0.15em] uppercase text-accent hover:underline"
              >
                すべての物件を見る →
              </Link>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
