"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  addToCart,
  removeFromCart,
  isInCart,
  onCartChange,
} from "@/lib/cart";
import {
  dataLicenseLabel,
  dataLicenseDesc,
  type DataLicense,
} from "@/lib/schemas";
import type { LicenseOption } from "@/lib/license-options";
import LicenseDifference, { LicenseDescription } from "@/components/license-difference";
import DataInquiry from "@/components/data-inquiry";
import { useLocale } from "@/components/locale-provider";
import PurchaseContents from "@/components/purchase-contents";
import type { PurchaseContent } from "@/lib/purchase-contents";

interface DataSalePanelProps {
  propertyId: string;
  propertyTitle: string;
  splatItemIndex: number;
  itemLabel: string;
  /** 選べるライセンス区分×価格。resolveLicenseOptions() の結果で必ず1件以上ある。 */
  licenseOptions: LicenseOption[];
  description: string;
  scannedAt: string;
  splatSizeMb: number;
  zipSizeMb: number;
  splatItemCount: number;
  tokenCost: 1 | 2 | 3 | 5;
  purchaseContents: PurchaseContent[];
  captureDevice?: string;
  alreadyPurchased?: boolean;
  displaySimulation?: boolean;
  /** エディトリアルライセンス選択時に表示する権利者クレジット表記。 */
  editorialRightsCredit?: string;
}

export default function DataSalePanel({
  propertyId,
  propertyTitle,
  splatItemIndex,
  itemLabel,
  licenseOptions,
  description,
  scannedAt,
  splatSizeMb,
  purchaseContents,
  captureDevice,
  alreadyPurchased = false,
  displaySimulation = false,
  editorialRightsCredit,
}: DataSalePanelProps) {
  const en = useLocale() === "en";
  const lc = en ? "en" : "ja";
  const [loading, setLoading] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [inCart, setInCart] = useState(false);
  // 複数ライセンスがある場合、買い手がここで選ぶ。既定は先頭（管理画面で
  // チェックした順＝最初に有効化した区分）。
  const [selectedLicense, setSelectedLicense] = useState<DataLicense>(
    licenseOptions[0]?.license ?? "standard",
  );
  const selectedOption =
    licenseOptions.find((o) => o.license === selectedLicense) ?? licenseOptions[0];
  const price = selectedOption?.price ?? 0;
  const license = selectedOption?.license ?? "standard";

  useEffect(() => {
    if (displaySimulation) return;
    const sync = () => setInCart(isInCart(propertyId, splatItemIndex));
    sync();
    return onCartChange(sync);
  }, [propertyId, splatItemIndex, displaySimulation]);

  const toggleCart = () => {
    if (displaySimulation) return;
    if (inCart) removeFromCart(propertyId, splatItemIndex);
    // 規約に同意していない状態ではカートに入れられない（2026-08-14 本人指示。
    // 「購入する」は元から同意必須だったが、カート経由だと同意なしで決済まで
    // 進めてしまう抜け道になっていた）。ボタン側の disabled と二重にガードする。
    else if (agreedTerms)
      addToCart({
        propertyId,
        splatItemIndex,
        title: propertyTitle,
        label: itemLabel,
        price,
        license,
      });
  };

  const handlePurchase = async () => {
    if (displaySimulation) return;
    if (!agreedTerms) {
      alert(en ? "Please agree to the purchase terms" : "購入規約に同意してください");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // agreedTerms はサーバー側でも必須検証され、同意時刻が購入レコードに記録される。
        // license はサーバー側で resolveLicenseOptions() に対して再検証され、
        // その区分の現在価格が使われる（クライアントの price は信用しない）。
        body: JSON.stringify({ propertyId, splatItemIndex, agreedTerms, license }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.ok) {
        window.location.reload();
      } else {
        alert(data.error || (en ? "Purchase failed" : "購入処理に失敗しました"));
      }
    } catch {
      alert(en ? "A network error occurred" : "通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const yen = price.toLocaleString(en ? "en-US" : "ja-JP");
  // 閲覧用の容量は、購入に含まれるファイル一覧と分ける。
  const meta = [
    splatSizeMb > 0 && `${en ? "Viewer preview" : "閲覧用プレビュー"} ${splatSizeMb} MB`,
    captureDevice || "",
  ].filter(Boolean).join(" / ");

  return (
    <div className="mt-4 min-w-0 space-y-3">
      <div className="min-w-0 border border-accent/30 bg-accent/5 p-4">
        <div className="flex items-baseline gap-2">
          <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-50">DATA</span>
          <span className="text-[13px] font-medium">
            {en ? "Buy 3D data" : "3Dデータ購入"}{itemLabel && ` — ${itemLabel}`}
          </span>
        </div>
        {description && (
          <p className="text-[11px] max-[720px]:text-[12px] opacity-60 mt-0.5 max-[720px]:line-clamp-none line-clamp-1">{description}</p>
        )}
        <div className="mono text-[10px] tracking-[0.1em] opacity-40 mt-1">{meta}</div>
        <p className="text-[13px] text-muted mt-2">{en ? "Captured: " : "撮影日："}{scannedAt || (en ? "Not registered" : "未登録")}</p>
        <PurchaseContents files={purchaseContents} en={en} />
      </div>
      <section aria-label={en ? "Purchase options" : "ライセンスと購入手続き"} className="min-w-0 border border-accent/30 bg-accent/5 p-4 space-y-4">
      <div className="min-w-0">
        {licenseOptions.length > 1 ? (
          <div className="mt-1.5">
            <div className="mono text-[9px] tracking-[0.18em] uppercase text-muted mb-1">
              {en ? "Select license" : "ライセンスを選択"}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {licenseOptions.map((o) => (
                <label
                  key={o.license}
                  title={dataLicenseDesc(o.license, lc)}
                  className={`flex items-center gap-1.5 px-2 py-1 border cursor-pointer text-[10px] transition ${
                    selectedLicense === o.license
                      ? "border-accent text-accent bg-accent/10"
                      : "border-line/60 text-muted hover:border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name={`license-${propertyId}-${splatItemIndex}`}
                    checked={selectedLicense === o.license}
                    onChange={() => setSelectedLicense(o.license)}
                    className="sr-only"
                  />
                  {dataLicenseLabel(o.license, lc)}
                  <span className="opacity-60">
                    （{o.price === 0 ? (en ? "Free" : "無料") : `¥${o.price.toLocaleString()}`}）
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="mono text-[9px] tracking-[0.18em] uppercase border border-accent/40 text-accent/80 px-1.5 py-0.5">
              LICENSE
            </span>
            <span className="text-[10px] opacity-70">{dataLicenseLabel(license, lc)}</span>
          </div>
        )}
        {/* 違いはツールチップに隠さず常時表示する（スマホではホバーできない） */}
        <LicenseDescription selected={license} locale={lc} />
        {license === "editorial" && editorialRightsCredit && (
          <p className="text-[10px] text-amber-500/90 mt-1 leading-snug">
            {en ? "Publishing requires this credit: " : "公開時は権利表記が必要です："}
            {editorialRightsCredit}
          </p>
        )}
      </div>

      {alreadyPurchased ? (
        <div className="flex items-center gap-3 shrink-0">
          <span className="mono text-[10px] tracking-[0.18em] uppercase text-green-400 border border-green-400/40 px-2 py-1">
            {en ? "✓ Purchased" : "✓ 購入済み"}
          </span>
          <Link
            href={displaySimulation ? "#" : en ? "/en/dashboard/purchases" : "/dashboard/purchases"}
            onClick={displaySimulation ? (event) => event.preventDefault() : undefined}
            className="px-4 py-1.5 max-[720px]:min-h-[44px] max-[720px]:inline-flex max-[720px]:items-center mono text-[10px] max-[720px]:text-[11px] tracking-[0.2em] uppercase border border-green-400/50 text-green-400 hover:bg-green-400 hover:text-bg transition"
          >
            {en ? "To downloads →" : "ダウンロードへ →"}
          </Link>
        </div>
      ) : (
        <>
          <div>
            {price === 0 ? (
              <span className="serif text-lg text-accent">{en ? "Free" : "無料"}</span>
            ) : (
              <>
                <span className="serif text-lg text-accent">¥{yen}</span>
                <span className="mono text-[9px] opacity-40 ml-1">{en ? "tax excl." : "税抜"}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] max-[720px]:text-[12px] max-[720px]:gap-2 max-[720px]:min-h-[44px] opacity-60 hover:opacity-80 transition">
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="w-3.5 h-3.5 max-[720px]:w-5 max-[720px]:h-5 accent-accent shrink-0"
              />
              <Link href={en ? "/en/terms/data-download" : "/terms/data-download"} target="_blank" className="underline max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px]">
                {en ? "Agree to terms" : "規約同意"}
              </Link>
            </label>
            {/* プラン切替では再マウントされない。実カート状態が残っても表示には使わない。 */}
            {inCart && !displaySimulation ? (
              <Link
                href={en ? "/en/cart" : "/cart"}
                className="w-[152px] shrink-0 flex items-center justify-center px-3 py-2 min-h-[44px] text-[12px] border border-accent text-ink bg-accent/10 hover:bg-accent/20 transition whitespace-nowrap"
              >
                {en ? "View cart" : "カートを見る"}
              </Link>
            ) : (
              <button
                type="button"
                onClick={toggleCart}
                disabled={!agreedTerms}
                title={
                  !agreedTerms
                    ? en
                      ? "Agree to the terms first"
                      : "先に規約に同意してください"
                    : undefined
                }
                className="w-[152px] shrink-0 flex items-center justify-center px-3 py-2 min-h-[44px] text-[12px] border border-line text-muted hover:border-accent hover:text-accent transition whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-muted"
              >
                {en ? "Add to cart" : "カートに入れる"}
              </button>
            )}
            <button
              onClick={handlePurchase}
              disabled={loading || !agreedTerms}
              className="px-4 py-1.5 max-[720px]:min-h-[44px] mono text-[10px] max-[720px]:text-[11px] tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-30 disabled:cursor-wait"
            >
              {loading
                ? en ? "Processing..." : "処理中..."
                : price === 0
                  ? en ? "Free download" : "無料でダウンロード"
                  : en ? "Buy" : "購入する"}
            </button>
          </div>
        </>
      )}
      {/* 比較表は basis-full で1行を占有させる。狭いテキスト列に入れると
          横スクロールが出て右端の列が切れる（実機で確認して移動した）。 */}
      <LicenseDifference options={licenseOptions} selected={license} locale={lc} />

      {/* 「自分の用途で使えるのか」を比較表の直下でそのまま聞ける。
          ⚠ LicenseDifference は区分が1つだと null を返すので、問い合わせ導線は
             その中に入れず必ずここに置く（1区分の物件でも聞けるようにする）。 */}
      <div inert={displaySimulation || undefined} className="w-full basis-full">
      <DataInquiry
        propertyId={propertyId}
        propertyTitle={propertyTitle}
        itemLabel={itemLabel}
        licenseLabel={dataLicenseLabel(license, lc)}
        en={en}
      />
      </div>
      </section>
    </div>
  );
}
