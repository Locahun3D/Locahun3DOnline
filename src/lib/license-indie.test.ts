import { describe, expect, it } from "vitest";
import { findLicensePrice, resolveLicenseOptions, suggestIndiePrice } from "./license-options";
import { DATA_LICENSES, DATA_LICENSE_MATRIX, dataLicenseLabel, propertySchema } from "./schemas";

describe("インディーライセンス（2026-11-11）", () => {
  it("グレード順はエディトリアルと標準の間", () => {
    expect(DATA_LICENSES.slice(0, 3)).toEqual(["editorial", "indie", "standard"]);
    expect(dataLicenseLabel("indie")).toBe("インディーライセンス");
    expect(dataLicenseLabel("indie", "en")).toBe("Indie license");
  });

  it("価格は管理画面の入力どおり（拡張=標準×2・エディトリアル=0 には影響しない）", () => {
    const item = { licenseOptions: [
      { license: "extended" as const, price: 0 },
      { license: "standard" as const, price: 200000 },
      { license: "indie" as const, price: 9800 },
      { license: "editorial" as const, price: 500 },
    ] };
    expect(resolveLicenseOptions(item)).toEqual([
      { license: "editorial", price: 0 },
      { license: "indie", price: 9800 },
      { license: "standard", price: 200000 },
      { license: "extended", price: 400000 },
    ]);
    expect(findLicensePrice(item, "indie")).toBe(9800);
  });

  it("保存スキーマが indie を受け付ける", () => {
    const schema = propertySchema.shape.splatItems.unwrap().element.shape.licenseOptions;
    expect(schema.safeParse([{ license: "indie", price: 9800 }]).success).toBe(true);
  });

  it("目安価格は標準の1/20を百円単位で切り上げ", () => {
    expect(suggestIndiePrice([{ license: "standard", price: 200000 }])).toBe(10000);
    expect(suggestIndiePrice([{ license: "standard", price: 250000 }])).toBe(12500);
    expect(suggestIndiePrice([{ license: "standard", price: 100001 }])).toBe(5100);
    expect(suggestIndiePrice([{ license: "indie", price: 9800 }])).toBeNull();
    expect(suggestIndiePrice([{ license: "standard", price: 0 }])).toBeNull();
  });

  it("可否表: 商用○・複数案件×・組込○（自作のみ）・再配布とAI学習は個別", () => {
    const by = Object.fromEntries(DATA_LICENSE_MATRIX.map((row) => [row.key, row.by.indie]));
    expect(by).toEqual({ production: "yes", multipleProjects: "no", embedding: "yes", resale: "ask", aiTraining: "ask" });
    const embedding = DATA_LICENSE_MATRIX.find((row) => row.key === "embedding");
    expect(embedding?.notes?.indie?.ja).toBe("自作の作品への組込のみ");
    expect(embedding?.by.standard).toBe("no");
  });
});
