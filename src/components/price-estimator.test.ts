import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import PriceEstimator from "./price-estimator";

// 2026-10-01 ビュースタジオ水道橋の依頼: 目安はスタジオの金額（3時間・半日・1日）、シミュレーションは出さない。
const base = { hourlyPrice: 9350, minUsageHours: 3, dailyPrice: 0, priceType: "hourly", taxIncluded: true, en: false };
const estimates = [
  { label: "3時間", labelEn: "3 hours", hours: 3, total: 29150 },
  { label: "半日", labelEn: "Half day", hours: 5, total: 47850 },
  { label: "1日", labelEn: "Full day", hours: 9, total: 77600 },
];

it("shows the studio's own estimate rows instead of the automatic ones", () => {
  const html = renderToStaticMarkup(createElement(PriceEstimator, { ...base, estimates, hideSimulator: true }));
  expect(html).toContain("¥29,150");
  expect(html).toContain("¥47,850");
  expect(html).toContain("¥77,600");
  expect(html).toContain("半日");
  expect(html).not.toContain("少人数");
  expect(html).not.toContain("料金シミュレーション");
  expect(html).toContain("合計（税込）");
});

it("keeps the automatic rows and the simulator by default", () => {
  const html = renderToStaticMarkup(createElement(PriceEstimator, base));
  expect(html).toContain("少人数");
  expect(html).toContain("料金シミュレーション");
});

it("states the daily maximum when the studio has one (2026-10-03)", () => {
  const html = renderToStaticMarkup(createElement(PriceEstimator, { ...base, hourlyPrice: 12000, dailyCap: 150000 }));
  expect(html).toContain("上限 ¥150,000");
});
