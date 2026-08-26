"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";

/**
 * /demo の料金シミュレーター。
 *
 * ⚠ 計算式・金額・文言は移植元
 *   `digiroke3d_Web/locahun3d_demo.html`（EN: `en/locahun3d_demo.html`）の
 *   inline script をそのまま複製している。**勝手に金額を足したり丸め方を
 *   変えたりしないこと。** 変更する場合は移植元と突き合わせて両方直す。
 *
 *   SCALE  : 小規模 ¥200,000 / 中規模 ¥350,000
 *   SCAN   : 1地点=[1,1] / 1–3地点=[1,3] / 4–10地点=[4,10] × ¥50,000、10地点以上=お問い合わせ
 *   METHOD : 歩行 +¥0 / 歩行+ドローン +¥120,000 / 歩行+ドローン+許可申請 +¥200,000
 *   OPTION : 同行 +¥0 / 別日 +¥40,000
 *   → min/max を出し、ローンチキャンペーンで Math.round(x/2)（50% OFF）を表示。
 *
 *   納期 : 小規模 +1日 / 中規模 +2日、ドローン併用 +1日、4–10地点 +2日。
 *
 * ⚠ 移植元は日付入力に flatpickr(CDN) を使っていたが、外部CDNは持ち込まない方針。
 *   ネイティブ <input type="date"> に置き換えた（既定値＝2週間後・最小＝今日は同じ）。
 */

const WK_JP = ["日", "月", "火", "水", "木", "金", "土"];
const WK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* 既定の撮影予定日（＝2週間後）と最小値（＝今日）。
   ⚠ SSR/プリレンダー時に「今日」を焼くとハイドレーション不一致や古い日付の
   焼き込みが起きるため、サーバ側スナップショットは空にして、クライアントで
   だけ日付を返す（useSyncExternalStore の getSnapshot / getServerSnapshot）。
   getSnapshot は同一参照を返す必要があるのでモジュールスコープにキャッシュする。 */
const EMPTY_DATES = { min: "", def: "" };
let cachedDates: { min: string; def: string } | null = null;
function clientDates() {
  if (!cachedDates) {
    const now = Date.now();
    cachedDates = {
      min: toISODate(new Date(now)),
      def: toISODate(new Date(now + 14 * 24 * 60 * 60 * 1000)),
    };
  }
  return cachedDates;
}
const noopSubscribe = () => () => {};

type Opt = { value: number; ja: string; en: string };

const SCALE_OPTIONS: Opt[] = [
  { value: 1, ja: "小規模（1日撮影 / 1ロケ）", en: "Small (single-day shoot / one location)" },
  { value: 2, ja: "中規模（2–3日 / 複数ロケ）", en: "Medium (2–3 days / multiple locations)" },
];
const SCAN_OPTIONS: Opt[] = [
  { value: 0, ja: "1 地点", en: "1 location" },
  { value: 1, ja: "1–3 地点", en: "1–3 locations" },
  { value: 2, ja: "4–10 地点", en: "4–10 locations" },
  { value: 3, ja: "10 地点以上", en: "10+ locations" },
];
const METHOD_OPTIONS: Opt[] = [
  { value: 1, ja: "歩行スキャン（+ ¥0）", en: "Walking scan (+ ¥0)" },
  { value: 2, ja: "歩行 + ドローンスキャン（+ ¥120,000）", en: "Walking + drone scan (+ ¥120,000)" },
  {
    value: 3,
    ja: "歩行 + ドローンスキャン + 許可申請（+ ¥200,000）",
    en: "Walking + drone scan + permit application (+ ¥200,000)",
  },
];
const OPT_OPTIONS: Opt[] = [
  { value: 0, ja: "同行（撮影当日に同行）", en: "Accompaniment (on the shoot day)" },
  { value: 1, ja: "前日・別日に撮影（+ ¥40,000）", en: "Shot on a prior / separate day (+ ¥40,000)" },
];

/** 選択内容＋概算のまとめ。問い合わせ本文に添えるための素の文字列。 */
export type EstimateSummary = string;

export default function EstimateSimulator({
  en,
  /** CTA の遷移先。既定は /contact（EN: /en/contact）。同ページ内フォームへ
   *  送りたい場合は "#scan-form" のようなアンカーを渡す。 */
  ctaHref,
  /** 選択が変わるたびに「選択内容＋概算」のまとめを親へ渡す（任意）。 */
  onEstimate,
}: {
  en: boolean;
  ctaHref?: string;
  onEstimate?: (summary: EstimateSummary) => void;
}) {
  const [scale, setScale] = useState(1);
  const [scan, setScan] = useState(0);
  const [method, setMethod] = useState(1);
  const [opt, setOpt] = useState(0);
  // 既定値＝2週間後 / 最小＝今日（移植元 flatpickr の設定と同じ）
  const dates = useSyncExternalStore(noopSubscribe, clientDates, () => EMPTY_DATES);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? dates.def;
  const minDate = dates.min;
  const setDate = setPicked;

  const fmt = useMemo(() => (n: number) => n.toLocaleString(en ? "en-US" : "ja-JP"), [en]);

  const price = useMemo(() => {
    if (scan === 3) {
      return { contact: true as const, main: en ? "Contact us" : "お問い合わせ", original: "" };
    }
    const baseScale = scale === 1 ? 200000 : 350000;
    const scanRange: [number, number] = scan === 0 ? [1, 1] : scan === 1 ? [1, 3] : [4, 10];
    const methodAdd = [0, 120000, 200000][method - 1];
    const optAdd = opt === 0 ? 0 : 40000;
    const min = baseScale + scanRange[0] * 50000 + methodAdd + optAdd;
    const max = baseScale + scanRange[1] * 50000 + methodAdd + optAdd;
    // Half-price launch campaign
    const halfMin = Math.round(min / 2);
    const halfMax = Math.round(max / 2);
    const dash = en ? "–" : "〜";
    return {
      contact: false as const,
      main: halfMin === halfMax ? fmt(halfMin) : `${fmt(halfMin)} ${dash} ${fmt(halfMax)}`,
      original: min === max ? `¥ ${fmt(min)}` : `¥ ${fmt(min)} ${dash} ${fmt(max)}`,
    };
  }, [scale, scan, method, opt, en, fmt]);

  const delivery = useMemo(() => {
    if (!date) {
      return {
        placeholder: true,
        text: en
          ? "Please select a planned scan shoot date"
          : "スキャン撮影予定日を選択してください",
      };
    }
    if (scan === 3) {
      return {
        placeholder: true,
        text: en
          ? "10+ locations — let’s discuss in a detailed quote"
          : "10 地点以上 — 詳細見積でご相談ください",
      };
    }
    let addDays = scale === 1 ? 1 : 2; // 1日撮影→翌日、2-3日撮影→2日後
    if (method >= 2) addDays += 1; // ドローン併用 → +1日
    if (scan === 2) addDays += 2; // 4-10地点 → +2日
    const d = new Date(date);
    d.setDate(d.getDate() + addDays);
    const text = en
      ? `Delivery on ${MO_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} (${WK_EN[d.getDay()]})`
      : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WK_JP[d.getDay()]}） 納品予定`;
    return { placeholder: false, text };
  }, [date, scan, scale, method, en]);

  /* ── 選択内容のまとめ ──
     問い合わせフォームへ添えるための文字列。⚠ 金額・納期は上で計算済みの
     price / delivery をそのまま文字にするだけ。ここで再計算しないこと
     （計算式を二重に持つと片方だけ直して食い違う）。 */
  const summary = useMemo(() => {
    const pick = (opts: Opt[], v: number) => {
      const x = opts.find((o) => o.value === v);
      return x ? (en ? x.en : x.ja) : "";
    };
    const amount = price.contact
      ? en
        ? "Contact us (10+ locations)"
        : "お問い合わせ（10 地点以上）"
      : en
        ? `${price.original} → 50% OFF: ¥ ${price.main}`
        : `${price.original} → 50%OFF適用: ¥ ${price.main}`;
    const rows: [string, string][] = en
      ? [
          ["Scale", pick(SCALE_OPTIONS, scale)],
          ["Locations", pick(SCAN_OPTIONS, scan)],
          ["Capture method", pick(METHOD_OPTIONS, method)],
          ["On-site accompaniment", pick(OPT_OPTIONS, opt)],
          ["Planned shoot date", date || "(not selected)"],
          ["Estimate", amount],
          ["Delivery", delivery.text],
        ]
      : [
          ["撮影規模", pick(SCALE_OPTIONS, scale)],
          ["スキャン地点数", pick(SCAN_OPTIONS, scan)],
          ["取得方法", pick(METHOD_OPTIONS, method)],
          ["撮影同行", pick(OPT_OPTIONS, opt)],
          ["撮影予定日", date || "（未選択）"],
          ["概算", amount],
          ["納期", delivery.text],
        ];
    const head = en ? "[Estimate simulator]" : "【概算シミュレーターの選択内容】";
    return [head, ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
  }, [en, scale, scan, method, opt, date, price, delivery]);

  useEffect(() => {
    onEstimate?.(summary);
  }, [summary, onEstimate]);

  const labelCls = "mono text-[10px] tracking-[0.28em] uppercase text-muted";
  const fieldCls =
    "w-full min-h-[46px] bg-white border border-line rounded-md px-3 py-2.5 text-[13px] text-ink " +
    "outline-none transition-colors hover:border-accent/60 focus:border-accent " +
    "focus:ring-[3px] focus:ring-accent/15";
  // 2列グリッドで左右のラベル行数が違っても入力欄の高さが揃うよう、下端で揃える
  const fieldWrapCls = "flex flex-col gap-2 min-w-0 justify-end";

  const o = (x: Opt) => (en ? x.en : x.ja);

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-5 sm:gap-6">
        <label className={fieldWrapCls}>
          <span className={labelCls}>{en ? "SCALE" : "SCALE / 撮影規模"}</span>
          <select
            className={fieldCls}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            {SCALE_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {o(x)}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldWrapCls}>
          <span className={labelCls}>
            {en
              ? "SCAN / Number of locations (demo scene is 1 location)"
              : "SCAN / スキャン地点数（デモシーンは 1 地点）"}
          </span>
          <select
            className={fieldCls}
            value={scan}
            onChange={(e) => setScan(Number(e.target.value))}
          >
            {SCAN_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {o(x)}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldWrapCls}>
          <span className={labelCls}>{en ? "METHOD / Capture method" : "METHOD / 取得方法"}</span>
          <select
            className={fieldCls}
            value={method}
            onChange={(e) => setMethod(Number(e.target.value))}
          >
            {METHOD_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {o(x)}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldWrapCls}>
          <span className={labelCls}>
            {en ? "OPTION / On-site accompaniment" : "OPTION / 撮影同行"}
          </span>
          <select className={fieldCls} value={opt} onChange={(e) => setOpt(Number(e.target.value))}>
            {OPT_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {o(x)}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldWrapCls + " sm:col-span-2"}>
          <span className={labelCls}>
            {en ? "SHOOT DATE / Planned scan shoot date" : "SHOOT DATE / スキャン撮影予定日"}
          </span>
          <input
            type="date"
            className={fieldCls + " cursor-pointer"}
            value={date}
            min={minDate || undefined}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      {/* ── 見積結果 ── */}
      <div className="mt-8 sm:mt-10 grid lg:grid-cols-[1fr_auto] gap-7 items-center border border-line rounded-md bg-white shadow-[0_20px_54px_rgba(15,23,42,.10)] px-5 py-6 sm:px-8 sm:py-8">
        <div className="min-w-0 text-center lg:text-left">
          {/* 期限は必ず明記する。期限のない割引は「値引き」ではなく実質的な
              定価になり、定価へ戻す道が塞がるため（D-007 と同じ理由）。 */}
          <div className="inline-flex flex-wrap items-center gap-3 px-4 py-2 mb-4 rounded-md border border-accent/55 bg-accent/8">
            <span className="mono text-[10px] tracking-[0.32em] uppercase text-accent">
              — LAUNCH CAMPAIGN —
            </span>
            <span className="text-[12.5px] text-ink">
              {en ? "Discount applied " : "割引適用 "}
              <strong className="font-black text-accent">50% OFF</strong>
              <span className="block sm:inline sm:ml-2.5 sm:pl-2.5 sm:border-l sm:border-accent/35 text-muted">
                {en ? "Until Dec 31, 2026" : "2026年12月31日まで"}
              </span>
            </span>
          </div>

          <div className="mono text-[10px] tracking-[0.3em] uppercase text-muted mb-2">
            — Estimated —
          </div>
          <div className="flex flex-col gap-1.5 items-center lg:items-start">
            {!price.contact && (
              <span
                id="price-original"
                aria-hidden="true"
                className="text-[15px] text-muted line-through decoration-muted/70"
              >
                {price.original}
              </span>
            )}
            <span className="serif inline-flex items-baseline gap-1.5 text-[clamp(1.4rem,5vw,2.4rem)] leading-none">
              {!price.contact && <span>¥</span>}
              <strong id="price" className="font-bold text-accent break-words">
                {price.main}
              </strong>
            </span>
          </div>

          <p className="mt-3 text-[11.5px] text-muted leading-[1.85]">
            {en ? (
              <>
                * Excl. tax, approximate. The final quote is provided after we discuss your
                requirements.
                <br />* Launch campaign pricing, valid until December 31, 2026. Standard rates apply
                afterwards.
              </>
            ) : (
              <>
                ※ 税抜・概算。最終見積は内容ヒアリング後にご提示します。
                <br />※
                ローンチキャンペーン（2026年12月31日まで）の特別価格です。期間終了後は通常価格に戻ります。
              </>
            )}
          </p>

          <div
            id="delivery"
            className="mt-4 pt-3.5 border-t border-dotted border-line flex flex-wrap items-baseline gap-4 justify-center lg:justify-start"
          >
            <span className="mono text-[10px] tracking-[0.3em] uppercase text-muted">
              — Delivery —
            </span>
            <span
              className={
                delivery.placeholder
                  ? "text-[12.5px] italic text-muted"
                  : "serif text-[15px] font-medium text-accent"
              }
            >
              {delivery.text}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3.5 lg:max-w-[280px] w-full">
          {/* 同ページ内にフォームがある場合（/contact/scan）はアンカーで下へ運ぶ。
              ページ遷移だと選択内容が消えるため Link ではなく素の <a>。 */}
          {ctaHref?.startsWith("#") ? (
            <a
              href={ctaHref}
              className="min-h-[46px] px-4 py-3 inline-flex items-center justify-center bg-accent text-white border border-accent mono text-[11px] tracking-[0.22em] uppercase font-medium leading-[1.2] hover:opacity-90 transition-opacity"
            >
              {en ? "Request a detailed quote →" : "詳細見積を依頼 →"}
            </a>
          ) : (
            <Link
              href={ctaHref ?? (en ? "/en/contact" : "/contact")}
              className="min-h-[46px] px-4 py-3 inline-flex items-center justify-center bg-accent text-white border border-accent mono text-[11px] tracking-[0.22em] uppercase font-medium leading-[1.2] hover:opacity-90 transition-opacity"
            >
              {en ? "Request a detailed quote →" : "詳細見積を依頼 →"}
            </Link>
          )}
          <span className="mono text-[10px] tracking-[0.16em] uppercase text-muted leading-[1.85] text-center text-balance">
            {en ? "— Contact us with these settings —" : "— この条件でお問い合わせいただけます —"}
          </span>
        </div>
      </div>
    </div>
  );
}
