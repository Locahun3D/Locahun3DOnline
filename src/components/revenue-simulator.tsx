"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";

/**
 * /submit-scan 用の分配額シミュレーター。
 *
 * ⚠ 計算ロジックは src/lib/payouts.ts の computeWithholding / MIN_SETTLEMENT_YEN /
 * MAX_TOTAL_SPLIT_PERCENT と同じ値・同じ式を意図的に複製している。payouts.ts は
 * 冒頭で "server-only" を import しており、そのファイルをクライアント
 * コンポーネントから実行時 import すると client バンドルが壊れるため
 * （同ファイルのコメント参照、preview-share.tsx と同じ回避パターン）、
 * このファイルは値のみを手で複製している。**payouts.ts 側の税率・下限額・
 * 上限率を変更したら、必ずこちらも合わせて変更すること。**
 */

const MIN_SETTLEMENT_YEN = 10_000;
const WITHHOLDING_THRESHOLD_YEN = 1_000_000;
const WITHHOLDING_RATE_LOW = 0.1021;
const WITHHOLDING_RATE_HIGH = 0.2042;
const MAX_SCANNER_RATE_PERCENT = 70;

function computeWithholding(grossYen: number, entityType: "individual" | "corporation"): number {
  if (entityType !== "individual") return 0;
  if (grossYen <= 0) return 0;
  if (grossYen <= WITHHOLDING_THRESHOLD_YEN) {
    return Math.floor(grossYen * WITHHOLDING_RATE_LOW);
  }
  const lowPart = Math.floor(WITHHOLDING_THRESHOLD_YEN * WITHHOLDING_RATE_LOW);
  const highPart = Math.floor((grossYen - WITHHOLDING_THRESHOLD_YEN) * WITHHOLDING_RATE_HIGH);
  return lowPart + highPart;
}

function yen(n: number, en: boolean): string {
  return en ? `¥${n.toLocaleString("en-US")}` : `¥${n.toLocaleString("ja-JP")}`;
}

const RATE_PRESETS = [
  { rate: 30, ja: "施設側の許諾取得は当社が担当", en: "We secure the facility's permission" },
  { rate: 50, ja: "施設側の許諾取得にご協力いただいた場合の目安", en: "Example if you help secure the facility's permission" },
];

export default function RevenueSimulator() {
  const en = useLocale() === "en";
  const [pricePerSale, setPricePerSale] = useState(50_000);
  const [saleCount, setSaleCount] = useState(3);
  const [ratePercent, setRatePercent] = useState(30);
  const [entityType, setEntityType] = useState<"individual" | "corporation">("individual");

  const result = useMemo(() => {
    const safePrice = Math.max(0, Math.floor(pricePerSale || 0));
    const safeCount = Math.max(0, Math.floor(saleCount || 0));
    const safeRate = Math.min(MAX_SCANNER_RATE_PERCENT, Math.max(0, ratePercent));
    const perSaleAmount = Math.floor((safePrice * safeRate) / 100);
    const grossYen = perSaleAmount * safeCount;
    const belowMinimum = grossYen > 0 && grossYen < MIN_SETTLEMENT_YEN;
    const withholdingYen = belowMinimum ? 0 : computeWithholding(grossYen, entityType);
    const netYen = belowMinimum ? 0 : grossYen - withholdingYen;
    return { grossYen, withholdingYen, netYen, belowMinimum };
  }, [pricePerSale, saleCount, ratePercent, entityType]);

  return (
    <div className="bg-white border border-line rounded-md px-5 py-4 mt-4">
      <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-1">
        {en ? "Earnings simulation" : "分配額シミュレーション"}
      </div>
      <p className="text-[11.5px] text-muted leading-relaxed mb-4">
        {en
          ? "This is an illustrative estimate only, not a quote. The actual share is agreed individually when a deal closes."
          : "あくまで試算です。実際の分配率は成立時に個別に合意します。"}
      </p>

      <div className="grid sm:grid-cols-2 gap-3.5 mb-4">
        <label className="block">
          <span className="block text-[11.5px] text-muted mb-1">
            {en ? "Price per sale (¥)" : "1件あたりの想定販売単価（¥）"}
          </span>
          <input
            type="number"
            min={0}
            step={1000}
            value={pricePerSale}
            onChange={(e) => setPricePerSale(Number(e.target.value))}
            className="w-full border border-line rounded-md px-3 py-2 text-[13.5px] bg-white focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
          />
        </label>
        <label className="block">
          <span className="block text-[11.5px] text-muted mb-1">
            {en ? "Expected number of sales" : "想定販売件数"}
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={saleCount}
            onChange={(e) => setSaleCount(Number(e.target.value))}
            className="w-full border border-line rounded-md px-3 py-2 text-[13.5px] bg-white focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
          />
        </label>
      </div>

      <div className="mb-4">
        <span className="block text-[11.5px] text-muted mb-1.5">
          {en ? `Your share (example, up to ${MAX_SCANNER_RATE_PERCENT}%)` : `分配率（例・最大${MAX_SCANNER_RATE_PERCENT}%まで）`}
        </span>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={MAX_SCANNER_RATE_PERCENT}
            step={1}
            value={ratePercent}
            onChange={(e) => setRatePercent(Number(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="mono text-[13px] text-ink w-12 text-right">{ratePercent}%</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {RATE_PRESETS.map((p) => (
            <button
              key={p.rate}
              type="button"
              onClick={() => setRatePercent(p.rate)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                ratePercent === p.rate
                  ? "bg-accent/10 border-accent text-accent"
                  : "border-line text-muted hover:border-accent/50"
              }`}
            >
              {p.rate}% — {en ? p.en : p.ja}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <span className="block text-[11.5px] text-muted mb-1.5">
          {en ? "You are" : "受取者区分"}
        </span>
        <div className="flex gap-1.5">
          {(["individual", "corporation"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setEntityType(t)}
              className={`text-[12px] px-3 py-1.5 rounded-full border transition ${
                entityType === t
                  ? "bg-accent/10 border-accent text-accent"
                  : "border-line text-muted hover:border-accent/50"
              }`}
            >
              {t === "individual" ? (en ? "Individual" : "個人") : en ? "Corporation" : "法人"}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-line pt-3.5 space-y-1.5">
        <Row label={en ? "Total accrued (before tax)" : "累計分配額（源泉徴収前）"} value={yen(result.grossYen, en)} />
        {entityType === "individual" && (
          <Row
            label={en ? "Withholding tax (10.21% / 20.42%)" : "源泉徴収額（10.21%／20.42%）"}
            value={`− ${yen(result.withholdingYen, en)}`}
            dim
          />
        )}
        <Row label={en ? "Estimated net payout" : "受取見込額"} value={yen(result.netYen, en)} strong />
        {result.belowMinimum && (
          <p className="text-[11.5px] text-accent mt-2">
            {en
              ? `Below the ¥${MIN_SETTLEMENT_YEN.toLocaleString("en-US")} minimum settlement — this would roll over to the next quarter rather than being paid out yet.`
              : `最低支払額（¥${MIN_SETTLEMENT_YEN.toLocaleString("ja-JP")}）未満のため、この時点ではまだ精算されず次回精算へ繰り越されます。`}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  dim,
}: {
  label: string;
  value: string;
  strong?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-[12.5px] ${dim ? "text-muted" : "text-ink"}`}>{label}</span>
      <span
        className={`mono ${strong ? "text-[16px] font-bold text-accent" : "text-[13px]"} ${
          dim ? "text-muted" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
