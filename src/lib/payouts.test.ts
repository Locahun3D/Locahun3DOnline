import { describe, it, expect } from "vitest";
import {
  computeWithholding,
  computeSettlement,
  validateSplitLines,
  isAccrualMissing,
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
