"use client";

import { useState } from "react";
import Link from "next/link";

interface DataSalePanelProps {
  propertyId: string;
  propertyTitle: string;
  splatItemIndex: number;
  itemLabel: string;
  price: number;
  description: string;
  scannedAt: string;
  splatSizeMb: number;
  zipSizeMb: number;
  splatItemCount: number;
  tokenCost: 1 | 2 | 3;
  downloadFileFormat?: string;
  downloadFileSizeMb?: number;
}

export default function DataSalePanel({
  propertyId,
  splatItemIndex,
  itemLabel,
  price,
  description,
  scannedAt,
  downloadFileFormat,
  downloadFileSizeMb,
}: DataSalePanelProps) {
  const [loading, setLoading] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  const handlePurchase = async () => {
    if (!agreedTerms) {
      alert("購入規約に同意してください");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, splatItemIndex }),
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

  const yen = price.toLocaleString("ja-JP");
  const dlFormat = downloadFileFormat || "PLY / RAD / OBJ";
  const dlSize = downloadFileSizeMb ?? 0;
  const meta = [
    scannedAt && `${scannedAt}`,
    `${dlFormat}`,
    dlSize > 0 && `${dlSize} MB`,
  ].filter(Boolean).join(" / ");

  return (
    <div className="mt-4 border border-accent/30 bg-[#0a0906] px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-baseline gap-2">
          <span className="mono text-[10px] tracking-[0.2em] uppercase opacity-50">DATA</span>
          <span className="text-[13px] font-medium">
            3Dデータ購入{itemLabel && ` — ${itemLabel}`}
          </span>
        </div>
        {description && (
          <p className="text-[11px] opacity-60 mt-0.5 line-clamp-1">{description}</p>
        )}
        <div className="mono text-[10px] tracking-[0.1em] opacity-40 mt-1">{meta}</div>
      </div>

      <div className="text-right shrink-0">
        <span className="serif text-lg text-accent">¥{yen}</span>
        <span className="mono text-[9px] opacity-40 ml-1">税込</span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] opacity-60 hover:opacity-80 transition">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="w-3.5 h-3.5 accent-accent shrink-0"
          />
          <Link href="/terms/data-download" target="_blank" className="underline">
            規約同意
          </Link>
        </label>
        <button
          onClick={handlePurchase}
          disabled={loading || !agreedTerms}
          className="px-4 py-1.5 mono text-[10px] tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-30 disabled:cursor-wait"
        >
          {loading ? "処理中..." : "購入する"}
        </button>
      </div>
    </div>
  );
}
