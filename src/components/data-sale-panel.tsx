"use client";

import { useState } from "react";

interface DataSalePanelProps {
  propertyId: string;
  propertyTitle: string;
  price: number;
  description: string;
  scannedAt: string;
  splatSizeMb: number;
  zipSizeMb: number;
  splatItemCount: number;
  tokenCost: 1 | 2 | 3;
}

const TOKEN_LABEL: Record<1 | 2 | 3, string> = {
  1: "小規模",
  2: "中規模",
  3: "大規模",
};

export default function DataSalePanel({
  propertyId,
  propertyTitle,
  price,
  description,
  scannedAt,
  splatSizeMb,
  zipSizeMb,
  splatItemCount,
  tokenCost,
}: DataSalePanelProps) {
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.ok) {
        window.location.reload();
      } else {
        alert(data.error || "購入処理に失敗しました");
      }
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

  return (
    <section className="mb-16">
      <div className="chapter-rule">
        <span className="opacity-60">DATA</span>
        <span>3D Data Purchase</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <span className="opacity-60">販売中</span>
      </div>

      <div className="border border-accent/40 bg-[#0a0906] p-6 md:p-8">
        <div className="grid md:grid-cols-[1fr_auto] gap-8 items-start">
          {/* Left: info */}
          <div className="space-y-5">
            <h3 className="serif text-lg tracking-wider">
              3DGSデータ購入
            </h3>

            {description && (
              <p className="text-sm leading-relaxed opacity-80 whitespace-pre-wrap">
                {description}
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[11px] mono tracking-[0.14em] uppercase">
              {scannedAt && (
                <div>
                  <div className="opacity-40 mb-1">SCANNED</div>
                  <div>{scannedAt}</div>
                </div>
              )}
              <div>
                <div className="opacity-40 mb-1">SCALE</div>
                <div>{TOKEN_LABEL[tokenCost]}</div>
              </div>
              {splatItemCount > 0 && (
                <div>
                  <div className="opacity-40 mb-1">ITEMS</div>
                  <div>{splatItemCount} ファイル</div>
                </div>
              )}
              {(splatSizeMb > 0 || zipSizeMb > 0) && (
                <div>
                  <div className="opacity-40 mb-1">SIZE</div>
                  <div>{zipSizeMb > 0 ? `${zipSizeMb} MB (ZIP)` : `${splatSizeMb} MB`}</div>
                </div>
              )}
            </div>
          </div>

          {/* Right: price + CTA */}
          <div className="flex flex-col items-center gap-4 min-w-[180px]">
            <div className="text-center">
              <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40 mb-1">
                PRICE
              </div>
              <div className="text-2xl font-semibold tracking-wider">
                {fmt(price)}
              </div>
              <div className="mono text-[10px] tracking-[0.14em] opacity-40 mt-1">
                税込
              </div>
            </div>
            <button
              onClick={handlePurchase}
              disabled={loading}
              className="w-full px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-40 disabled:cursor-wait"
            >
              {loading ? "処理中..." : "購入する"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
