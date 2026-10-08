import { describe, it, expect } from "vitest";
import {
  halfYearPeriod,
  periodContaining,
  previousPeriod,
  suggestSettlementPeriod,
} from "./payout-period";

describe("halfYearPeriod（分配規約 第4条1項）", () => {
  it("H1 = 1/1〜6/30、7/31までに支払い", () => {
    expect(halfYearPeriod(2026, "H1")).toMatchObject({
      start: "2026-01-01",
      end: "2026-06-30",
      payBy: "2026-07-31",
      label: "2026H1（1/1〜6/30）",
    });
  });

  it("H2 = 7/1〜12/31、翌年1/31までに支払い", () => {
    expect(halfYearPeriod(2026, "H2")).toMatchObject({
      start: "2026-07-01",
      end: "2026-12-31",
      payBy: "2027-01-31",
      label: "2026H2（7/1〜12/31）",
    });
  });
});

describe("periodContaining / previousPeriod（JST基準）", () => {
  it("JSTで6/30 23:59は上期、7/1 0:00は下期", () => {
    expect(periodContaining(new Date("2026-06-30T14:59:00Z")).half).toBe("H1");
    expect(periodContaining(new Date("2026-06-30T15:00:00Z")).half).toBe("H2");
  });

  it("1月は前年の下期が直前の期", () => {
    const p = previousPeriod(new Date("2027-01-05T00:00:00Z"));
    expect(p.year).toBe(2026);
    expect(p.half).toBe("H2");
  });

  it("7月は同年の上期が直前の期", () => {
    const p = previousPeriod(new Date("2026-07-10T00:00:00Z"));
    expect(p.year).toBe(2026);
    expect(p.half).toBe("H1");
  });

  it("UTCでは12/31でもJSTで1/1なら直前の期は前年H2", () => {
    expect(previousPeriod(new Date("2026-12-31T15:00:00Z")).label).toBe("2026H2（7/1〜12/31）");
  });
});

describe("suggestSettlementPeriod", () => {
  it("通常は直前に締まった半期、最終精算は現在の半期", () => {
    const now = new Date("2026-10-08T03:00:00Z");
    expect(suggestSettlementPeriod(now).label).toBe("2026H1（1/1〜6/30）");
    expect(suggestSettlementPeriod(now, { finalSettlement: true }).label).toBe(
      "2026H2（7/1〜12/31）",
    );
  });
});
