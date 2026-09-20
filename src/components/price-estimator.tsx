"use client";

import { useState } from "react";
import { isJpDayOff, jpDayKind, jpHolidayName } from "@/lib/jp-holidays";
import { dailyEstimates, priceChoices, simulateDailyPrice, simulatePrice, usageEstimates, type DayKind, type RateSurcharge } from "@/lib/property-presentation";

type RatePlan = { label: string; labelEn: string; hourlyPrice: number; minHours: number };

/** "YYYY-MM-DD" の n 日後（UTCで日付だけを進める。時差の影響を受けない）。 */
function addDays(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)).toISOString().slice(0, 10);
}

/**
 * 概要カードの「撮影別の目安」＋「料金シミュレーション」。
 * 2026-09-19 採用（20案の18＋02）→ 2026-09-20 拡張: 用途の切り替え、カレンダーで日付を選ぶと土日・祝日を
 * 自動判定、開始時刻と利用時間から時間帯の割増を1時間ごとに計算する。
 * 2026-09-20 本人指示「全て選択制になるように」: 用途別プランが無い物件でも、必ず選択肢（時間貸し／1日貸し）を
 * 出して選んでから計算する（選択肢の合成は priceChoices）。1日貸しは日数で計算し、時間帯の割増は掛けない。
 * 時間貸し（priceType=hourly）で単価か日額のある物件だけに出す。
 */
export default function PriceEstimator({
  hourlyPrice, minUsageHours, dailyPrice, priceType, ratePlans = [], rateSurcharges = [], taxIncluded = false, openHours = ["", ""], en,
}: {
  hourlyPrice: number; minUsageHours: number; dailyPrice: number; priceType: string;
  ratePlans?: RatePlan[]; rateSurcharges?: (RateSurcharge & { labelEn?: string })[];
  taxIncluded?: boolean; openHours?: string[]; en: boolean;
}) {
  const choices = priceChoices({ priceType, hourlyPrice, minUsageHours, dailyPrice, ratePlans });
  const surcharges = rateSurcharges.filter((s) => s.label && s.percent !== 0);
  const openFrom = /^\d{2}:/.test(openHours[0] ?? "") ? Number(openHours[0].slice(0, 2)) : 9;
  const [choiceIdx, setChoiceIdx] = useState(0);
  const [date, setDate] = useState("");
  const [startHour, setStartHour] = useState(Math.max(openFrom, 9));
  const [hoursRaw, setHours] = useState(4);
  const [days, setDays] = useState(1);

  const choice = choices[Math.min(choiceIdx, choices.length - 1)];
  if (!choice) return null;
  const daily = choice.kind === "daily";
  const rate = choice.price;
  const min = Math.max(1, choice.minHours);
  const hours = Math.max(min, hoursRaw);

  // 目安表は選んだ料金に合わせる: 1日貸し → 1〜3日、時間貸し → 撮影の単位（1日行は日額があれば日額）、用途別プラン → その単価のみ
  const rows = daily ? [] : usageEstimates({ priceType, hourlyPrice: rate, minUsageHours: min, dailyPrice: choice.fromPlan ? 0 : dailyPrice });
  const dayRows = daily ? dailyEstimates(rate) : [];
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
  const dayKinds: DayKind[] = Array.from({ length: days }, (_, i) => jpDayKind(date ? addDays(date, i) : ""));
  const sim = daily
    ? simulateDailyPrice({ dailyPrice: rate, days: dayKinds, surcharges })
    : simulatePrice({ hourlyPrice: rate, startHour, hours, holiday: dayOff, day: jpDayKind(date), surcharges });
  const hasHolidayRule = surcharges.some((s) => s.holidays);
  const surchargeLabel = (label: string) => (en && surcharges.find((s) => s.label === label)?.labelEn) || label;
  // 1日貸しでは時間帯の割増を掛けないので、注記にも出さない
  const notedSurcharges = daily ? surcharges.filter((s) => s.holidays) : surcharges;
  const unit = daily ? (en ? "/day" : "/日") : en ? "/h" : "/時間";
  // max-w-full + text-left: 長いプラン名でもカード幅を超えず、ラベルは折り返す（2026-09-20）
  const chip = "min-h-[40px] max-w-full px-3.5 py-1.5 border text-[13px] font-medium text-left transition";
  const stepBtn = "w-11 h-full text-[18px] leading-none disabled:opacity-30 hover:bg-line/40";

  return (
    <div className="mt-6 pt-6 border-t border-line" data-price-estimator>
      <div className="mono text-[10px] tracking-[0.22em] uppercase text-muted mb-3">
        {en ? "Pricing" : "料金"}
      </div>

      {/* 必ず選択制: 選択肢が1つでも「選んでいる状態」のチップとして見せる */}
      <div className="text-[12px] text-muted mb-2">{en ? "Choose a rate" : "料金を選ぶ"}</div>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={en ? "Rate" : "料金の種類"} data-price-choices>
        {choices.map((c, i) => {
          const on = c.key === choice.key;
          return (
            <button key={c.key} type="button" aria-pressed={on} onClick={() => setChoiceIdx(i)}
              className={`${chip} ${on ? "bg-ink text-white border-ink" : "border-line hover:border-ink"}`}>
              {(en && c.labelEn) || c.label}
              <span className={`ml-2 text-[12px] whitespace-nowrap ${on ? "text-white/70" : "text-muted"}`}>{yen(c.price)}{c.kind === "daily" ? (en ? "/day" : "/日") : en ? "/h" : "/時間"}</span>
            </button>
          );
        })}
      </div>

      <table className="w-full text-[14px] border-collapse">
        <thead>
          <tr className="text-[11px] text-muted tracking-[0.06em]">
            <th className="text-left font-medium py-1.5">{en ? "Use" : "目安"}</th>
            <th className="text-right font-medium py-1.5">{daily ? (en ? "Days" : "日数") : en ? "Hours" : "時間"}</th>
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
          {dayRows.map((r, i) => (
            <tr key={r.days} className="border-t border-line">
              <td className="py-2.5 pr-2">{en ? (r.days === 1 ? "Single day" : `${r.days}-day shoot`) : r.days === 1 ? "1日撮影" : `${r.days}日連続`}</td>
              <td className="py-2.5 text-right whitespace-nowrap">{en ? `${r.days} day${r.days > 1 ? "s" : ""}` : `${r.days}日`}</td>
              <td className={`py-2.5 text-right whitespace-nowrap font-bold ${i === 0 ? "text-accent" : ""}`}>{yen(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* シミュレーション: 日付（土日祝を自動判定）・開始時刻・時間 → 1時間ごとに割増を計算。1日貸しは日付と日数だけ */}
      <div className="mt-4 border border-line px-4 py-4">
        <div className="text-[12px] text-muted mb-3">{en ? "Price simulator" : "料金シミュレーション"}</div>
        {/* 列数は画面幅でなくカード幅で決める: iPad縦や2カラム時はカードが狭く、sm:3列だと日付欄が詰まる（2026-09-20） */}
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <label className="block">
            <span className="block text-[11px] text-muted mb-1">{daily ? (en ? "First day" : "利用開始日") : en ? "Date" : "利用日"}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 border border-line bg-white px-2.5 text-[14px]" />
          </label>
          {daily ? (
            <div>
              <span className="block text-[11px] text-muted mb-1">{en ? "Days" : "日数"}</span>
              <div className="flex items-center border border-line h-11">
                <button type="button" aria-label={en ? "1 day less" : "1日減らす"} onClick={() => setDays(Math.max(1, days - 1))} disabled={days <= 1} className={stepBtn}>−</button>
                <span className="flex-1 text-center font-bold text-[15px] tabular-nums">{days}{en ? (days > 1 ? " days" : " day") : "日"}</span>
                <button type="button" aria-label={en ? "1 day more" : "1日増やす"} onClick={() => setDays(Math.min(31, days + 1))} disabled={days >= 31} className={stepBtn}>＋</button>
              </div>
            </div>
          ) : (
            <>
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
                  <button type="button" aria-label={en ? "1 hour less" : "1時間減らす"} onClick={() => setHours(Math.max(min, hours - 1))} disabled={hours <= min} className={stepBtn}>−</button>
                  <span className="flex-1 text-center font-bold text-[15px] tabular-nums">{hours}{en ? " h" : "時間"}</span>
                  <button type="button" aria-label={en ? "1 hour more" : "1時間増やす"} onClick={() => setHours(Math.min(24, hours + 1))} disabled={hours >= 24} className={stepBtn}>＋</button>
                </div>
              </div>
            </>
          )}
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
              <span>{l.label === "通常" ? (en ? "Standard" : "通常") : surchargeLabel(l.label)}<span className="text-muted ml-2">{yen(l.rate)} × {l.hours}{daily ? (en ? (l.hours > 1 ? " days" : " day") : "日") : en ? " h" : "時間"}</span></span>
              <span className="tabular-nums whitespace-nowrap">{yen(l.rate * l.hours)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-2 pt-3 border-t border-ink/20">
          <span className="text-[12px] text-muted">
            {daily
              ? `${yen(rate)}${unit} × ${days}`
              : <>{String(startHour).padStart(2, "0")}:00〜{String((startHour + hours) % 24).padStart(2, "0")}:00{startHour + hours > 24 ? (en ? " (next day)" : "（翌日）") : ""}</>}
          </span>
          <span className="ml-auto whitespace-nowrap"><span className="text-[11px] text-muted mr-2">{taxIncluded ? (en ? "incl. tax" : "税込") : en ? "excl. tax" : "税別"}</span>
            <span className="text-[24px] font-black text-accent tabular-nums" aria-live="polite">{yen(sim.total)}</span></span>
        </div>
      </div>

      <p className="text-[12px] text-muted mt-2 leading-relaxed">
        {daily
          ? en
            ? "Estimate only. Time-of-day surcharges do not apply to the full-day rate."
            : "目安の金額です。1日貸しには時間帯の割増はかかりません。"
          : en
            ? `Estimate only. ${min > 1 ? `${min} h minimum. ` : ""}Load-in to load-out counts as usage time.`
            : `目安の金額です。${min > 1 ? `最低${min}時間から。` : ""}搬入から完全撤去までが利用時間です。`}
        {/* 2026-09-20 本人指示: 料金は変わりうるので、確認先を明記する */}
        <br />
        {en ? "Rates may change. Please confirm the details with the studio." : "料金は変動する可能性があります。詳しくはスタジオにご確認ください。"}
        {notedSurcharges.length > 0 && (
          <>
            <br />
            {notedSurcharges.map((s) => `${surchargeLabel(s.label)} ${s.percent > 0 ? "+" : ""}${s.percent}%${s.holidays ? (s.includeSaturday === false ? (en ? " (not Saturdays)" : "（土曜は対象外）") : "") : en ? ` (${s.fromHour}:00–${s.toHour}:00)` : `（${s.fromHour}:00〜${s.toHour}:00）`}`).join(" ／ ")}
          </>
        )}
      </p>
    </div>
  );
}
