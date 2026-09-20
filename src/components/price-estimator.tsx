"use client";

import { useState } from "react";
import { isJpDayOff, jpDayKind, jpHolidayName } from "@/lib/jp-holidays";
import { simulatePrice, usageEstimates, type RateSurcharge } from "@/lib/property-presentation";

type RatePlan = { label: string; labelEn: string; hourlyPrice: number; minHours: number };

/**
 * 概要カードの「撮影別の目安」＋「料金シミュレーション」。
 * 2026-09-19 採用（20案の18＋02）→ 2026-09-20 拡張: 用途の切り替え、カレンダーで日付を選ぶと土日・祝日を
 * 自動判定、開始時刻と利用時間から時間帯の割増を1時間ごとに計算する。
 * 時間貸し（priceType=hourly・単価あり）の物件だけに出す。
 */
export default function PriceEstimator({
  hourlyPrice, minUsageHours, dailyPrice, priceType, ratePlans = [], rateSurcharges = [], taxIncluded = false, openHours = ["", ""], en,
}: {
  hourlyPrice: number; minUsageHours: number; dailyPrice: number; priceType: string;
  ratePlans?: RatePlan[]; rateSurcharges?: (RateSurcharge & { labelEn?: string })[];
  taxIncluded?: boolean; openHours?: string[]; en: boolean;
}) {
  const plans = ratePlans.filter((p) => p.label && p.hourlyPrice > 0);
  const surcharges = rateSurcharges.filter((s) => s.label && s.percent !== 0);
  const openFrom = /^\d{2}:/.test(openHours[0] ?? "") ? Number(openHours[0].slice(0, 2)) : 9;
  const [planIdx, setPlanIdx] = useState(0);
  const [date, setDate] = useState("");
  const [startHour, setStartHour] = useState(Math.max(openFrom, 9));
  const plan = plans[planIdx];
  const rate = plan ? plan.hourlyPrice : hourlyPrice;
  const min = Math.max(1, (plan?.minHours || minUsageHours) | 0);
  const [hoursRaw, setHours] = useState(4);
  const hours = Math.max(min, hoursRaw);

  if (priceType !== "hourly" || !(rate > 0)) return null;
  const rows = usageEstimates({ priceType, hourlyPrice: rate, minUsageHours: min, dailyPrice: plan ? 0 : dailyPrice });
  const yen = (n: number) => `¥${n.toLocaleString(en ? "en-US" : "ja-JP")}`;
  const useLabels: Record<string, [string, string]> = {
    "still-small": ["スチール・少人数", "Stills, small crew"],
    "still-half": ["スチール・半日", "Stills, half day"],
    "movie-day": ["ムービー・1日", "Video, full day"],
  };
  const holidayName = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    return m ? jpHolidayName(Number(m[1]), Number(m[2]), Number(m[3])) : null;
  })();
  const dayOff = isJpDayOff(date);
  const sim = simulatePrice({ hourlyPrice: rate, startHour, hours, holiday: dayOff, day: jpDayKind(date), surcharges });
  const hasHolidayRule = surcharges.some((s) => s.holidays);
  // max-w-full + text-left: 長いプラン名でもカード幅を超えず、ラベルは折り返す（2026-09-20）
  const chip = "min-h-[40px] max-w-full px-3.5 py-1.5 border text-[13px] font-medium text-left transition";

  return (
    <div className="mt-6 pt-6 border-t border-line" data-price-estimator>
      <div className="mono text-[10px] tracking-[0.22em] uppercase text-muted mb-3">
        {en ? "Pricing" : "料金"}
      </div>

      {plans.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={en ? "Type of use" : "用途"}>
          {plans.map((p, i) => (
            <button key={i} type="button" aria-pressed={i === planIdx} onClick={() => setPlanIdx(i)}
              className={`${chip} ${i === planIdx ? "bg-ink text-white border-ink" : "border-line hover:border-ink"}`}>
              {(en && p.labelEn) || p.label}
              <span className={`ml-2 text-[12px] whitespace-nowrap ${i === planIdx ? "text-white/70" : "text-muted"}`}>{yen(p.hourlyPrice)}{en ? "/h" : "/時間"}</span>
            </button>
          ))}
        </div>
      )}

      <table className="w-full text-[14px] border-collapse">
        <thead>
          <tr className="text-[11px] text-muted tracking-[0.06em]">
            <th className="text-left font-medium py-1.5">{en ? "Use" : "目安"}</th>
            <th className="text-right font-medium py-1.5">{en ? "Hours" : "時間"}</th>
            <th className="text-right font-medium py-1.5">{en ? "Total" : "合計"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-2.5 pr-2">{useLabels[r.key][en ? 1 : 0]}</td>
              <td className="py-2.5 text-right whitespace-nowrap">{r.daily ? (en ? "1 day" : "1日") : en ? `${r.hours} h` : `${r.hours}時間`}</td>
              <td className={`py-2.5 text-right whitespace-nowrap font-bold ${i === rows.length - 1 ? "text-accent" : ""}`}>{yen(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* シミュレーション: 日付（土日祝を自動判定）・開始時刻・時間 → 1時間ごとに割増を計算 */}
      <div className="mt-4 border border-line px-4 py-4">
        <div className="text-[12px] text-muted mb-3">{en ? "Price simulator" : "料金シミュレーション"}</div>
        {/* 列数は画面幅でなくカード幅で決める: iPad縦や2カラム時はカードが狭く、sm:3列だと日付欄が詰まる（2026-09-20） */}
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <label className="block">
            <span className="block text-[11px] text-muted mb-1">{en ? "Date" : "利用日"}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 border border-line bg-white px-2.5 text-[14px]" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-muted mb-1">{en ? "Start" : "開始時刻"}</span>
            <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))}
              className="w-full h-11 border border-line bg-white px-2.5 text-[14px]">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </label>
          <div>
            <span className="block text-[11px] text-muted mb-1">{en ? "Hours" : "利用時間"}</span>
            <div className="flex items-center border border-line h-11">
              <button type="button" aria-label={en ? "1 hour less" : "1時間減らす"} onClick={() => setHours(Math.max(min, hours - 1))} disabled={hours <= min}
                className="w-11 h-full text-[18px] leading-none disabled:opacity-30 hover:bg-line/40">−</button>
              <span className="flex-1 text-center font-bold text-[15px] tabular-nums">{hours}{en ? " h" : "時間"}</span>
              <button type="button" aria-label={en ? "1 hour more" : "1時間増やす"} onClick={() => setHours(Math.min(24, hours + 1))} disabled={hours >= 24}
                className="w-11 h-full text-[18px] leading-none disabled:opacity-30 hover:bg-line/40">＋</button>
            </div>
          </div>
        </div>

        {date && (
          <p className="text-[12px] mt-2.5">
            {dayOff
              ? <span className="text-accent font-bold">{holidayName ? (en ? `Holiday (${holidayName})` : `祝日（${holidayName}）`) : jpDayKind(date) === "saturday" ? (en ? "Saturday" : "土曜") : en ? "Sunday" : "日曜"}{hasHolidayRule && sim.lines.some((l) => l.label !== "通常") ? (en ? " — surcharge applies" : " — 割増料金で計算") : ""}</span>
              : <span className="text-muted">{en ? "Weekday" : "平日"}</span>}
          </p>
        )}

        <ul className="mt-3 text-[13px]">
          {sim.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 py-1.5 border-t border-line first:border-t-0">
              <span>{l.label === "通常" ? (en ? "Standard" : "通常") : l.label}<span className="text-muted ml-2">{yen(l.rate)} × {l.hours}{en ? " h" : "時間"}</span></span>
              <span className="tabular-nums whitespace-nowrap">{yen(l.rate * l.hours)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-2 pt-3 border-t border-ink/20">
          <span className="text-[12px] text-muted">
            {String(startHour).padStart(2, "0")}:00〜{String((startHour + hours) % 24).padStart(2, "0")}:00{startHour + hours > 24 ? (en ? " (next day)" : "（翌日）") : ""}
          </span>
          <span className="ml-auto whitespace-nowrap"><span className="text-[11px] text-muted mr-2">{taxIncluded ? (en ? "incl. tax" : "税込") : en ? "excl. tax" : "税別"}</span>
            <span className="text-[24px] font-black text-accent tabular-nums" aria-live="polite">{yen(sim.total)}</span></span>
        </div>
      </div>

      <p className="text-[12px] text-muted mt-2 leading-relaxed">
        {en
          ? `Estimate only. ${min > 1 ? `${min} h minimum. ` : ""}Load-in to load-out counts as usage time.`
          : `目安の金額です。${min > 1 ? `最低${min}時間から。` : ""}搬入から完全撤去までが利用時間です。`}
        {surcharges.length > 0 && (
          <>
            <br />
            {surcharges.map((s) => `${s.label} ${s.percent > 0 ? "+" : ""}${s.percent}%${s.holidays ? (s.includeSaturday === false ? "（土曜は対象外）" : "") : `（${s.fromHour}:00〜${s.toHour}:00）`}`).join(" ／ ")}
          </>
        )}
      </p>
    </div>
  );
}
