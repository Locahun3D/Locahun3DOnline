import { describe, expect, it } from "vitest";
import { usageRestrictionLines } from "./schemas";

describe("usage restrictions", () => {
  it("defaults to no restrictions", () => {
    expect(usageRestrictionLines(undefined)).toEqual([]);
    expect(
      usageRestrictionLines({ noAlteration: false, noDestruction: false, noDarkThemes: false, credit: "none", creditText: "" }),
    ).toEqual([]);
  });

  it("lists each restriction and the credit", () => {
    const lines = usageRestrictionLines({
      noAlteration: true, noDestruction: true, noDarkThemes: true, credit: "required", creditText: "撮影協力 Aスタジオ",
    });
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain("撮影協力 Aスタジオ");
  });

});
