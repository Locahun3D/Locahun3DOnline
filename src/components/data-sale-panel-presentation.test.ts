import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/components/locale-provider", () => ({ useLocale: () => "ja" }));
vi.mock("@/components/data-inquiry", () => ({ default: () => null }));
import DataSalePanel from "./data-sale-panel";

const props = {
  propertyId: "fixture", propertyTitle: "Test", splatItemIndex: 2, itemLabel: "Scene",
  licenseOptions: [{ license: "standard" as const, price: 150000 }, { license: "extended" as const, price: 400000 }],
  description: "", scannedAt: "2026-09-12", splatSizeMb: 356, zipSizeMb: 0,
  splatItemCount: 3, tokenCost: 1 as const, purchaseContents: [],
};
it("renders actual prices and keeps the full comparison collapsed inside purchase", () => {
  const html = renderToStaticMarkup(createElement(DataSalePanel, { ...props, propertyPresentation: true }));
  expect(html.match(/data-property-license-card=/g)).toHaveLength(2);
  expect(html.match(/data-property-license-price=/g)).toHaveLength(2);
  expect(html).toContain("¥150,000");
  expect(html).toContain("¥400,000");
  expect(html).not.toContain('href="#license-details"');
  expect(html).toContain("<details");
  expect(html).toContain("data-property-license-comparison");
  expect(html).toContain("<table");
  expect(html).toContain("disabled");
});
it("leaves the default panel presentation and inline comparison unchanged", () => {
  const html = renderToStaticMarkup(createElement(DataSalePanel, props));
  expect(html).not.toContain("data-property-license-card");
  expect(html).toContain("<details");
  expect(html).toContain('class="sr-only"');
  expect(html).not.toContain('href="#license-details"');
});
it("provides Japanese phrase boundaries without splitting the inclusion term", () => {
  const html = renderToStaticMarkup(createElement(DataSalePanel, { ...props, propertyPresentation: true }));
  const paragraphs = [...html.matchAll(/<p>(.*?)<\/p>/g)].map(match => match[1].replace(/<\/?span[^>]*>/g, "").split(/<wbr\s*\/?\s*>/));
  expect(paragraphs.some(parts => parts.includes("同梱・改変配布、"))).toBe(true);
});
