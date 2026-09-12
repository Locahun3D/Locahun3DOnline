import { describe, expect, it } from "vitest";
import { findLicensePrice, resolveLicenseOptions } from "./license-options";
import { propertySchema } from "./schemas";

describe("extended license pricing", () => {
  it("allows saving twice the maximum standard price without widening other license limits", () => {
    const schema = propertySchema.shape.splatItems.unwrap().element.shape.licenseOptions;
    expect(schema.safeParse(resolveLicenseOptions({ licenseOptions: [
      { license: "standard", price: 99999999 }, { license: "extended", price: 0 },
    ] })).success).toBe(true);
    expect(schema.safeParse([{ license: "standard", price: 100000000 }]).success).toBe(false);
    expect(schema.safeParse([{ license: "custom", price: 100000000 }]).success).toBe(false);
    expect(schema.safeParse([{ license: "extended", price: 199999999 }]).success).toBe(false);
  });
  it("derives the extended price from standard instead of a stale stored price", () => {
    const item = { licenseOptions: [
      { license: "extended" as const, price: 0 },
      { license: "standard" as const, price: 5000 },
    ] };
    expect(resolveLicenseOptions(item)).toEqual([
      { license: "standard", price: 5000 },
      { license: "extended", price: 10000 },
    ]);
    expect(item.licenseOptions[0].price).toBe(0);
    item.licenseOptions[1].price = 8000;
    expect(findLicensePrice(item, "extended")).toBe(16000);
  });

  it("keeps free standard data free for extended use", () => {
    expect(findLicensePrice({ licenseOptions: [
      { license: "standard", price: 0 },
      { license: "extended", price: 10000 },
    ] }, "extended")).toBe(0);
  });

  it("does not add unoffered licenses or change legacy and custom prices", () => {
    expect(resolveLicenseOptions({ salePrice: 5000 })).toEqual([{ license: "standard", price: 5000 }]);
    expect(findLicensePrice({ license: "extended", salePrice: 7000 }, "extended")).toBe(7000);
    expect(resolveLicenseOptions({ licenseOptions: [
      { license: "extended", price: 7000 }, { license: "custom", price: 15000 },
    ] })).toEqual([{ license: "extended", price: 7000 }, { license: "custom", price: 15000 }]);
  });
});
