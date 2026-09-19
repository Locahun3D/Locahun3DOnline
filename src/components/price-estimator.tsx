"use client";

import { useState } from "react";
import { usageEstimates } from "@/lib/property-presentation";

/**
 * 概要カードの「用途別の目安」＋「料金シミュレーション」（2026-09-19 本人採用: 20案の18＋02）。
 * 単価だけでは「結局いくら？」に答えないので、撮影の単位で合計を見せ、時間を選べば合計が変わる。
 * 時間貸し（priceType=hourly・単価あり）の物件だけに出す。税込表示は既存の価格帯と同じ扱い。
 */
export default function PriceEstimator({
  hourlyPrice, minUsageHours, dailyPrice, priceType, en,
}: { hourlyPrice: number; minUsageHours: number; dailyPrice: number; priceType: string; en: boolean }) {
  const rows = usageEstimates({ priceType, hourlyPrice, minUsageHours, dailyPrice });
  const min = Math.max(1, minUsageHours | 0);
  const [hours, setHours] = useState(Math.max(min, 4));
  if (rows.length === 0) return null;
  const yen = (n: number) => `¥${n.toLocaleString(en ? "en-US" : "ja-JP")}`;
  const labels: Record<string, [string, string]> = {
    "still-small": ["スチール・少人数", "Stills, small crew"],
    "still-half": ["スチール・半日", "Stills, half day"],
    "movie-day": ["ムービー・1日", "Video, full day"],
  };
  const total = hours * hourlyPrice;
  const step = (d: number) => setHours((h) => Math.min(24, Math.max(min, h + d)));
  return (
    <div className="mt-6 pt-6 border-t border-line" data-price-estimator>
      <div className="mono text-[10px] tracking-[0.22em] uppercase text-muted mb-3">
        {en ? "Estimates by use" : "撮影別の目安"}
      </div>
      <table className="w-full text-[14px] border-collapse">
        <thead>
          <tr className="text-[11px] text-muted font-medium tracking-[0.06em]">
            <th className="text-left font-medium py-1.5">{en ? "Use" : "用途"}</th>
            <th className="text-right font-medium py-1.5">{en ? "Hours" : "時間"}</th>
            <th className="text-right font-medium py-1.5">{en ? "Total" : "合計"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-2.5 pr-2">{labels[r.key][en ? 1 : 0]}</td>
              <td className="py-2.5 text-right whitespace-nowrap">{r.daily ? (en ? "1 day" : "1日") : en ? `${r.hours} h` : `${r.hours}時間`}</td>
              <td className={`py-2.5 text-right whitespace-nowrap font-bold ${i === rows.length - 1 ? "text-accent" : ""}`}>{yen(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* シミュレーション: 時間を増減すると合計が変わる */}
      <div className="mt-4 border border-line px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="text-[12px] text-muted">{en ? "Simulate" : "料金シミュレーション"}</div>
        <div className="inline-flex items-center border border-line">
          <button type="button" aria-label={en ? "1 hour less" : "1時間減らす"} onClick={() => step(-1)} disabled={hours <= min}
            className="w-10 h-10 text-[18px] leading-none disabled:opacity-30 hover:bg-line/40">−</button>
          <span className="min-w-[4.5em] text-center font-bold text-[15px] tabular-nums">{hours}{en ? " h" : "時間"}</span>
          <button type="button" aria-label={en ? "1 hour more" : "1時間増やす"} onClick={() => step(1)} disabled={hours >= 24}
            className="w-10 h-10 text-[18px] leading-none disabled:opacity-30 hover:bg-line/40">＋</button>
        </div>
        <div className="ml-auto text-right">
          <span className="text-[11px] text-muted mr-2">{yen(hourlyPrice)} × {hours}</span>
          <span className="text-[22px] font-black text-accent tabular-nums" aria-live="polite">{yen(total)}</span>
        </div>
      </div>
      <p className="text-[12px] text-muted mt-2 leading-relaxed">
        {en
          ? `${yen(hourlyPrice)}/h${minUsageHours > 0 ? `, ${minUsageHours} h minimum` : ""}. Load-in to load-out counts as usage time.`
          : `${yen(hourlyPrice)}/時間${minUsageHours > 0 ? `・最低${minUsageHours}時間` : ""}。搬入から完全撤去までが利用時間です。`}
      </p>
    </div>
  );
}
