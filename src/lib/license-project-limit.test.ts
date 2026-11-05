import { describe, expect, it } from "vitest";
import { DATA_LICENSE_MATRIX, dataLicenseDesc, purchasedLicenseDesc } from "./schemas";

/** 2026-11-06 改定: 標準以下は1案件、拡張は案件数の制限なし。過去の購入には遡及しない。 */
describe("案件数の条件", () => {
  it("新規購入の説明に案件数の条件が出る", () => {
    expect(dataLicenseDesc("standard")).toContain("1案件まで");
    expect(dataLicenseDesc("editorial")).toContain("1案件まで");
    expect(dataLicenseDesc("extended")).toContain("案件数の制限なし");
    expect(dataLicenseDesc("standard", "en")).toContain("one project per purchase");
  });

  it("可否表は標準以下が不可、拡張が可", () => {
    const row = DATA_LICENSE_MATRIX.find((r) => r.key === "multipleProjects")!;
    expect(row.by).toEqual({ standard: "no", extended: "yes", custom: "ask", editorial: "no" });
  });

  it("適用開始より前に同意した購入は旧条件のまま", () => {
    const old = { termsAgreedAt: "2026-11-05T14:59:59.000Z" };
    expect(purchasedLicenseDesc("standard", old)).not.toContain("案件");
    expect(purchasedLicenseDesc("extended", old, "en")).not.toContain("projects");
  });

  it("適用開始以降の同意は新条件", () => {
    const next = { termsAgreedAt: "2026-11-05T15:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" };
    expect(purchasedLicenseDesc("standard", next)).toContain("1案件まで");
  });

  it("同意日時が無い購入は購入日時で判定する", () => {
    expect(purchasedLicenseDesc("standard", { completedAt: "2026-08-01T00:00:00.000Z" })).not.toContain("案件");
  });
});
