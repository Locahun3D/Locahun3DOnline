import { describe, it, expect } from "vitest";
import {
  computeWithholding,
  computeSettlement,
  validateSplitLines,
  isAccrualMissing,
  computeLedgerAmount,
  taxExclusiveFromInclusive,
  ledgerBreakdown,
  MIN_SETTLEMENT_YEN,
} from "./payouts";

describe("computeWithholding", () => {
  it("個人・100万円以下は10.21%（円未満切り捨て）", () => {
    expect(computeWithholding(500_000, "individual")).toBe(Math.floor(500_000 * 0.1021));
  });

  it("個人・ちょうど100万円は10.21%のみ（閾値ちょうど）", () => {
    expect(computeWithholding(1_000_000, "individual")).toBe(102_100);
  });

  it("個人・100万円をまたぐ場合は按分（100万×10.21% + 超過分×20.42%）", () => {
    // 150万円 → 100万×10.21%(102,100) + 50万×20.42%(102,100) = 204,200
    expect(computeWithholding(1_500_000, "individual")).toBe(204_200);
  });

  it("法人は常に源泉徴収0円", () => {
    expect(computeWithholding(1_500_000, "corporation")).toBe(0);
    expect(computeWithholding(500_000, "corporation")).toBe(0);
  });

  it("0円以下は0円", () => {
    expect(computeWithholding(0, "individual")).toBe(0);
  });
});

describe("computeSettlement", () => {
  it("最低支払額ちょうど(¥10,000)は精算対象（belowMinimum=false）", () => {
    const result = computeSettlement([{ amountYen: MIN_SETTLEMENT_YEN }], {
      entityType: "corporation",
    });
    expect(result.belowMinimum).toBe(false);
    expect(result.grossYen).toBe(10_000);
    expect(result.netYen).toBe(10_000);
  });

  it("最低支払額未満(¥9,999)は繰越(belowMinimum=true・源泉/差引は0)", () => {
    const result = computeSettlement([{ amountYen: 9_999 }], {
      entityType: "individual",
    });
    expect(result.belowMinimum).toBe(true);
    expect(result.grossYen).toBe(9_999);
    expect(result.withholdingYen).toBe(0);
    expect(result.netYen).toBe(0);
  });

  it("法人は源泉徴収なしで満額が差引支払額になる", () => {
    const result = computeSettlement(
      [{ amountYen: 700_000 }, { amountYen: 800_000 }],
      { entityType: "corporation" },
    );
    expect(result.grossYen).toBe(1_500_000);
    expect(result.withholdingYen).toBe(0);
    expect(result.netYen).toBe(1_500_000);
    expect(result.belowMinimum).toBe(false);
  });

  it("個人・100万円をまたぐ複数行合算で源泉徴収と差引支払額を計算する", () => {
    const result = computeSettlement(
      [{ amountYen: 900_000 }, { amountYen: 600_000 }],
      { entityType: "individual" },
    );
    expect(result.grossYen).toBe(1_500_000);
    expect(result.withholdingYen).toBe(204_200);
    expect(result.netYen).toBe(1_500_000 - 204_200);
  });
});

describe("validateSplitLines", () => {
  it("合計70%ちょうどはOK", () => {
    const result = validateSplitLines([{ ratePercent: 20 }, { ratePercent: 50 }]);
    expect(result.ok).toBe(true);
  });

  it("合計70%超はエラー（当社取り分30%未満になるため）", () => {
    const result = validateSplitLines([{ ratePercent: 40 }, { ratePercent: 31 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("70%");
    }
  });
});

describe("isAccrualMissing", () => {
  it("completed×分配設定あり×台帳行なしは欠落とみなす", () => {
    expect(
      isAccrualMissing({
        purchaseStatus: "completed",
        priceYen: 5_000,
        hasSplit: true,
        hasLedgerEntry: false,
      }),
    ).toBe(true);
  });

  it("台帳行が既にあれば欠落ではない", () => {
    expect(
      isAccrualMissing({
        purchaseStatus: "completed",
        priceYen: 5_000,
        hasSplit: true,
        hasLedgerEntry: true,
      }),
    ).toBe(false);
  });

  it("分配設定が無ければ欠落ではない（起票対象外）", () => {
    expect(
      isAccrualMissing({
        purchaseStatus: "completed",
        priceYen: 5_000,
        hasSplit: false,
        hasLedgerEntry: false,
      }),
    ).toBe(false);
  });

  it("¥0購入は欠落ではない（分配元の代金が無い）", () => {
    expect(
      isAccrualMissing({
        purchaseStatus: "completed",
        priceYen: 0,
        hasSplit: true,
        hasLedgerEntry: false,
      }),
    ).toBe(false);
  });

  it("completed以外(pending等)は欠落ではない", () => {
    expect(
      isAccrualMissing({
        purchaseStatus: "pending",
        priceYen: 5_000,
        hasSplit: true,
        hasLedgerEntry: false,
      }),
    ).toBe(false);
  });
});

describe("computeLedgerAmount（掲載データ販売分配規約 第2条 2026-10-08 / 持ち込みスキャン規約 第5条 2026-10-09）", () => {
  it("venue: 税込11,000円 → 税抜10,000円の20% = 2,000円 + 消費税相当200円", () => {
    expect(computeLedgerAmount("venue", 11_000, 20)).toEqual({
      taxExclusiveBaseYen: 10_000,
      shareYen: 2_000,
      taxAddOnYen: 200,
      totalYen: 2_200,
    });
  });

  it("venue: 端数は税抜→分配額→消費税相当額の各段階で切り捨て", () => {
    // 税込 9,999 → 税抜 floor(9999*100/110)=9,090 → 20% = 1,818 → 税 floor(181.8)=181
    expect(computeLedgerAmount("venue", 9_999, 20)).toEqual({
      taxExclusiveBaseYen: 9_090,
      shareYen: 1_818,
      taxAddOnYen: 181,
      totalYen: 1_999,
    });
  });

  it("venue: 決済手数料は控除しない", () => {
    // 税込 33,000 → 税抜 30,000 → 6,000 + 600
    expect(computeLedgerAmount("venue", 33_000, 20).totalYen).toBe(6_600);
  });

  it("venue: 個別合意の率（小数）でも浮動小数誤差なく計算する", () => {
    // 税抜 10,000 × 12.34% = 1,234 → 税 123
    expect(computeLedgerAmount("venue", 11_000, 12.34)).toMatchObject({
      shareYen: 1_234,
      taxAddOnYen: 123,
      totalYen: 1_357,
    });
  });

  it("scanner（持ち込みスキャン規約 第5条 2026-10-09）: venue と同じ計算・30%", () => {
    // 税込 11,000 → 税抜 10,000 → 30% = 3,000 + 消費税相当 300
    expect(computeLedgerAmount("scanner", 11_000, 30)).toEqual({
      taxExclusiveBaseYen: 10_000,
      shareYen: 3_000,
      taxAddOnYen: 300,
      totalYen: 3_300,
    });
  });

  it("scanner: 50%・端数は各段階で切り捨て・決済手数料は控除しない", () => {
    // 税込 9,999 → 税抜 9,090 → 50% = 4,545 → 税 floor(454.5)=454
    expect(computeLedgerAmount("scanner", 9_999, 50)).toEqual({
      taxExclusiveBaseYen: 9_090,
      shareYen: 4_545,
      taxAddOnYen: 454,
      totalYen: 4_999,
    });
  });

  it("referrer は従来どおり販売額×率（消費税相当額なし）", () => {
    expect(computeLedgerAmount("referrer", 11_000, 10)).toEqual({
      taxExclusiveBaseYen: 11_000,
      shareYen: 1_100,
      taxAddOnYen: 0,
      totalYen: 1_100,
    });
    expect(computeLedgerAmount("referrer", 9_999, 10).totalYen).toBe(999);
  });

  it("0円・0%は0", () => {
    expect(computeLedgerAmount("venue", 0, 20).totalYen).toBe(0);
    expect(computeLedgerAmount("venue", 11_000, 0).totalYen).toBe(0);
  });
});

describe("taxExclusiveFromInclusive", () => {
  it("floor(amount*100/110)", () => {
    expect(taxExclusiveFromInclusive(11_000)).toBe(10_000);
    expect(taxExclusiveFromInclusive(1)).toBe(0);
    expect(taxExclusiveFromInclusive(110)).toBe(100);
    expect(taxExclusiveFromInclusive(-5)).toBe(0);
  });
});

describe("ledgerBreakdown / computeSettlement の内訳", () => {
  it("内訳の無い旧レコードは amountYen 全額を分配額・消費税相当0として扱う", () => {
    expect(ledgerBreakdown({ amountYen: 3_000 })).toEqual({
      shareYen: 3_000,
      taxAddOnYen: 0,
      hasBreakdown: false,
    });
  });

  it("内訳の無い旧 scanner 行（旧計算の amountYen）は再計算せずそのまま精算する", () => {
    const result = computeSettlement(
      [{ amountYen: 3_300 }, { amountYen: 3_300, shareYen: 3_000, taxAddOnYen: 300 }, { amountYen: 4_000 }],
      { entityType: "corporation" },
    );
    expect(result.grossYen).toBe(10_600);
    expect(result.shareYen).toBe(10_300);
    expect(result.taxAddOnYen).toBe(300);
  });

  it("新旧混在でも合計は amountYen の和、内訳は分配額+消費税相当額", () => {
    const result = computeSettlement(
      [{ amountYen: 2_200, shareYen: 2_000, taxAddOnYen: 200 }, { amountYen: 8_000 }],
      { entityType: "corporation" },
    );
    expect(result.grossYen).toBe(10_200);
    expect(result.shareYen).toBe(10_000);
    expect(result.taxAddOnYen).toBe(200);
    expect(result.netYen).toBe(10_200);
  });
});

describe("computeSettlement 最終精算（掲載終了）", () => {
  it("¥10,000未満でも finalSettlement なら精算できる（源泉ルールは従来どおり）", () => {
    const result = computeSettlement(
      [{ amountYen: 2_200 }],
      { entityType: "individual" },
      { finalSettlement: true },
    );
    expect(result.belowMinimum).toBe(false);
    expect(result.grossYen).toBe(2_200);
    expect(result.withholdingYen).toBe(Math.floor(2_200 * 0.1021));
    expect(result.netYen).toBe(2_200 - Math.floor(2_200 * 0.1021));
  });

  it("finalSettlement でも0円は精算しない", () => {
    const result = computeSettlement([], { entityType: "corporation" }, { finalSettlement: true });
    expect(result.belowMinimum).toBe(true);
  });

  it("finalSettlement でなければ従来どおり繰越", () => {
    const result = computeSettlement([{ amountYen: 2_200 }], { entityType: "corporation" });
    expect(result.belowMinimum).toBe(true);
  });
});
