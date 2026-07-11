"use client";

import { useMemo, useState } from "react";
import { PLANS } from "./plan-cards";

const LABOR = 5000; // 半日拘束の人件費（概算） ¥/人・回
const REFERENCE_PLAN_CODE = "STUDIO"; // 比較の基準プラン（固定表示）

function yen(n: number, en: boolean): string {
  const abs = Math.round(Math.abs(n));
  return "¥" + abs.toLocaleString(en ? "en-US" : "ja-JP");
}

/**
 * 料金ページ プランカード群の直下 / 比較表の上に置く ROI 計算機。
 * デザインは gen_pricing_v2.py の `.roi-card` を Tailwind + React state に翻訳したもの。
 * 比較先はStudio固定（4プラン選択式のUIは「わかりずらい」とのフィードバックで撤去）。
 * 価格自体は plan-cards.tsx の PLANS が単一ソース — ここでは二重管理しない。
 */
export default function RoiCalculator({ en }: { en: boolean }) {
  const [people, setPeople] = useState(4);
  const [trips, setTrips] = useState(2);
  const [fare, setFare] = useState(3000);

  const referencePlan = PLANS.find((p) => p.code === REFERENCE_PLAN_CODE) ?? PLANS[0];

  const { legacy, save, hours } = useMemo(() => {
    const legacy = people * trips * (fare + LABOR);
    return {
      legacy,
      save: legacy - referencePlan.monthly,
      hours: people * trips * 2,
    };
  }, [people, trips, fare, referencePlan.monthly]);

  return (
    <section className="mt-16">
      <div className="grid md:grid-cols-2 border border-line bg-white">
        {/* 左: スライダー */}
        <div className="p-8 sm:p-9 border-b md:border-b-0 md:border-r border-line">
          <h2 className="text-[19px] font-bold mb-1.5">
            {en ? "See what you'd save — 30 seconds." : "おいくら浮くか、30秒で。"}
          </h2>
          <p className="text-[12px] text-muted mb-6">
            {en
              ? "Adjust the sliders to match your current on-site scouting."
              : "いまの「現地下見」の条件を動かしてみてください。"}
          </p>

          <div className="mb-6">
            <div className="flex justify-between items-baseline text-[12px] mb-2">
              <b className="font-bold">
                {en ? "People scouting on-site" : "ロケハンに行く人数"}
              </b>
              <output className="mono text-accent font-bold tabular-nums">
                {en ? `${people} people` : `${people} 名`}
              </output>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={people}
              onChange={(e) => setPeople(Number(e.target.value))}
              className="w-full accent-accent"
              aria-label={en ? "People scouting on-site" : "ロケハンに行く人数"}
            />
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-baseline text-[12px] mb-2">
              <b className="font-bold">
                {en ? "Site visits per month" : "月の下見回数"}
              </b>
              <output className="mono text-accent font-bold tabular-nums">
                {en ? `${trips} / mo` : `${trips} 回`}
              </output>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={trips}
              onChange={(e) => setTrips(Number(e.target.value))}
              className="w-full accent-accent"
              aria-label={en ? "Site visits per month" : "月の下見回数"}
            />
          </div>

          <div className="mb-1">
            <div className="flex justify-between items-baseline text-[12px] mb-2">
              <b className="font-bold">
                {en
                  ? "Round-trip fare per person"
                  : "1人あたり交通費（往復）"}
              </b>
              <output className="mono text-accent font-bold tabular-nums">
                {yen(fare, en)}
              </output>
            </div>
            <input
              type="range"
              min={500}
              max={20000}
              step={500}
              value={fare}
              onChange={(e) => setFare(Number(e.target.value))}
              className="w-full accent-accent"
              aria-label={en ? "Round-trip fare per person" : "1人あたり交通費（往復）"}
            />
          </div>
        </div>

        {/* 右: 結果 */}
        <div className="p-8 sm:p-9 flex flex-col justify-center gap-4">
          <div className="flex justify-between items-baseline text-[12.5px]">
            <span>{en ? "Traditional on-site scouting" : "従来の現地下見"}</span>
            <span className="mono text-[17px] font-bold text-muted line-through decoration-1 tabular-nums">
              {yen(legacy, en)}
              <small className="text-[11px] font-normal ml-1">{en ? "/mo" : "/月"}</small>
            </span>
          </div>
          <div className="flex justify-between items-baseline text-[12.5px]">
            <span>
              {en ? "Locahun 3D " : "ロケハン3D "}
              <span className="mono text-[10px] text-accent">{referencePlan.code}</span>
            </span>
            <span className="mono text-[17px] font-bold tabular-nums">
              {yen(referencePlan.monthly, en)}
              <small className="text-[11px] font-normal text-muted ml-1">
                {en ? "/mo" : "/月"}
              </small>
            </span>
          </div>

          <div className="border-t border-line" />

          <div className="text-center py-1.5">
            <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted mb-1">
              {en ? "Monthly savings" : "月間の削減額"}
            </div>
            <div className="mono text-[38px] font-bold text-accent tabular-nums leading-none">
              {save >= 0 ? "−" : "+"}
              {yen(save, en)}
            </div>
            <div className="text-[10.5px] text-muted mt-2">
              {en ? (
                <>
                  <b className="text-ink">{hours} hours</b> of travel go straight
                  back into production.
                </>
              ) : (
                <>
                  移動時間 <b className="text-ink">{hours}時間</b> もそのまま制作へ
                </>
              )}
            </div>
          </div>

          <p className="text-[10px] text-muted leading-[1.9] mt-2">
            {en
              ? "※ Traditional cost estimated as people × trips × (fare + ¥5,000 half-day labor cost)."
              : "※ 従来コスト = 人数 × 回数 ×（交通費 + 半日拘束の人件費 ¥5,000）で概算。"}
          </p>
        </div>
      </div>
    </section>
  );
}
