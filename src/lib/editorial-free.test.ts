import { describe, expect, it } from "vitest";
import { applyExtendedLicensePricing, resolveLicenseOptions } from "./license-options";

describe("editorial license is free", () => {
  it("forces editorial price to 0 and keeps extended = 2x standard", () => {
    const out = applyExtendedLicensePricing([
      { license: "editorial", price: 50000 },
      { license: "standard", price: 200000 },
      { license: "extended", price: 1 },
    ]);
    expect(out.map((o) => o.price)).toEqual([0, 200000, 400000]);
  });

  it("offers editorial to buyers again, sorted first", () => {
    const out = resolveLicenseOptions({
      licenseOptions: [
        { license: "standard", price: 200000 },
        { license: "editorial", price: 9 },
      ],
    });
    expect(out).toEqual([
      { license: "editorial", price: 0 },
      { license: "standard", price: 200000 },
    ]);
  });

  it("legacy single editorial license is free", () => {
    expect(resolveLicenseOptions({ license: "editorial", salePrice: 100000 })).toEqual([
      { license: "editorial", price: 0 },
    ]);
  });
});
