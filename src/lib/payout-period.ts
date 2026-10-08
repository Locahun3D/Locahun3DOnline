/**
 * 分配金の精算期間（半期）ヘルパー。純粋関数のみ・server-only 依存なし
 * （admin の client component からも import してよい）。
 *
 * /terms/listing-revenue-share 第4条1項（2026-10-08）:
 *   6月30日・12月31日締め、締め日の属する月の翌月末日までに支払う。
 *   上期 H1 = 1月1日〜6月30日 → 7月31日までに支払い
 *   下期 H2 = 7月1日〜12月31日 → 翌年1月31日までに支払い
 *
 * 日付はすべて日本時間（JST, UTC+9）の暦日で判定する。
 */

export type HalfYear = "H1" | "H2";

export interface SettlementPeriod {
  year: number;
  half: HalfYear;
  /** 期間の初日（JSTの暦日, YYYY-MM-DD）。 */
  start: string;
  /** 期間の締め日（JSTの暦日, YYYY-MM-DD）。 */
  end: string;
  /** 支払期限（締め日の翌月末日, YYYY-MM-DD）。 */
  payBy: string;
  /** 精算期間ラベル。例: "2026H1（1/1〜6/30）"。periodLabel の既定値に使う。 */
  label: string;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstYearMonth(now: Date): { year: number; month: number } {
  const d = new Date(now.getTime() + JST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** 指定年・半期の精算期間。 */
export function halfYearPeriod(year: number, half: HalfYear): SettlementPeriod {
  if (half === "H1") {
    return {
      year,
      half,
      start: `${year}-01-01`,
      end: `${year}-06-30`,
      payBy: `${year}-07-31`,
      label: `${year}H1（1/1〜6/30）`,
    };
  }
  return {
    year,
    half,
    start: `${year}-07-01`,
    end: `${year}-12-31`,
    payBy: `${year + 1}-01-31`,
    label: `${year}H2（7/1〜12/31）`,
  };
}

/** now（JST）が属する半期。 */
export function periodContaining(now: Date): SettlementPeriod {
  const { year, month } = jstYearMonth(now);
  return halfYearPeriod(year, month <= 6 ? "H1" : "H2");
}

/** now（JST）の直前に締まった半期。 */
export function previousPeriod(now: Date): SettlementPeriod {
  const { year, month } = jstYearMonth(now);
  return month <= 6 ? halfYearPeriod(year - 1, "H2") : halfYearPeriod(year, "H1");
}

/**
 * 精算を作成するときの既定の期間。精算は締め日の後に行うので、
 * 「直前に締まった半期」を提案する（例: 2026-07-10 → 2026H1、2027-01-05 → 2026H2）。
 * 掲載終了に伴う最終精算（期の途中）は、現在の半期を提案する。
 */
export function suggestSettlementPeriod(
  now: Date,
  opts?: { finalSettlement?: boolean },
): SettlementPeriod {
  return opts?.finalSettlement ? periodContaining(now) : previousPeriod(now);
}
