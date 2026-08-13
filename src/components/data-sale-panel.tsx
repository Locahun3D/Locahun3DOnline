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
  downloadFileFormat?: string;
  downloadFileSizeMb?: number;
  captureDevice?: string;
  alreadyPurchased?: boolean;
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
  downloadFileFormat,
  downloadFileSizeMb,
  captureDevice,
  alreadyPurchased = false,
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
    const sync = () => setInCart(isInCart(propertyId, splatItemIndex));
    sync();
    return onCartChange(sync);
  }, [propertyId, splatItemIndex]);

  const toggleCart = () => {
    if (inCart) removeFromCart(propertyId, splatItemIndex);
    else
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
  const dlFormat = downloadFileFormat || "PLY / RAD / OBJ";
  const dlSize = downloadFileSizeMb ?? 0;
  // 点群数（旧仕様）は「あっても参考にならない」との判断で撤去。実際の容量が
  // 分かる方が買い手にとって意味があるため、DL用ファイルと3DGS本体それぞれの
  // 容量を出す（両者が同じ/近い値でも「ダウンロードされる実体」がどちらか
  // 分かるよう区別して表示する）。
  const meta = [
    scannedAt && `${scannedAt}`,
    `${dlFormat}`,
    dlSize > 0 && `DL ${dlSize} MB`,
    splatSizeMb > 0 && `3DGS ${splatSizeMb} MB`,
    captureDevice || "",
  ].filter(Boolean).join(" / ");

  return (
    <div className="mt-4 border border-accent/30 bg-[#0a0906] px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-baseline gap-2">
          <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-50">DATA</span>
          <span className="text-[13px] font-medium">
            {en ? "Buy 3D data" : "3Dデータ購入"}{itemLabel && ` — ${itemLabel}`}
          </span>
        </div>
        {description && (
          <p className="text-[11px] opacity-60 mt-0.5 line-clamp-1">{description}</p>
        )}
        <div className="mono text-[10px] tracking-[0.1em] opacity-40 mt-1">{meta}</div>
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
            href={en ? "/en/dashboard/purchases" : "/dashboard/purchases"}
            className="px-4 py-1.5 mono text-[10px] tracking-[0.2em] uppercase border border-green-400/50 text-green-400 hover:bg-green-400 hover:text-bg transition"
          >
            {en ? "To downloads →" : "ダウンロードへ →"}
          </Link>
        </div>
      ) : (
        <>
          <div className="text-right shrink-0">
            {price === 0 ? (
              <span className="serif text-lg text-accent">{en ? "Free" : "無料"}</span>
            ) : (
              <>
                <span className="serif text-lg text-accent">¥{yen}</span>
                <span className="mono text-[9px] opacity-40 ml-1">{en ? "tax incl." : "税込"}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] opacity-60 hover:opacity-80 transition">
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent shrink-0"
              />
              <Link href={en ? "/en/terms/data-download" : "/terms/data-download"} target="_blank" className="underline">
                {en ? "Agree to terms" : "規約同意"}
              </Link>
            </label>
            {inCart ? (
              <Link
                href={en ? "/en/cart" : "/cart"}
                className="px-3 py-1.5 mono text-[10px] tracking-[0.2em] uppercase border border-green-400/50 text-green-400 hover:bg-green-400 hover:text-bg transition whitespace-nowrap"
              >
                {en ? "✓ Cart → view" : "✓ カート → 見る"}
              </Link>
            ) : (
              <button
                type="button"
                onClick={toggleCart}
                className="px-3 py-1.5 mono text-[10px] tracking-[0.2em] uppercase border border-line text-muted hover:border-accent hover:text-accent transition whitespace-nowrap"
              >
                {en ? "+ Cart" : "+ カート"}
              </button>
            )}
            <button
              onClick={handlePurchase}
              disabled={loading || !agreedTerms}
              className="px-4 py-1.5 mono text-[10px] tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-30 disabled:cursor-wait"
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
      <DataInquiry
        propertyId={propertyId}
        propertyTitle={propertyTitle}
        itemLabel={itemLabel}
        licenseLabel={dataLicenseLabel(license, lc)}
        en={en}
      />
    </div>
  );
}
