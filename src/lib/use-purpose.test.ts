import { describe, expect, it } from "vitest";
import { cleanBuyerCompany, isUsePurpose, parsePurchaseIntake, purposeLabel } from "./use-purpose";

describe("3Dデータの用途", () => {
  it("決めた選択肢だけを受け付ける", () => {
    expect(isUsePurpose("video")).toBe(true);
    expect(isUsePurpose("vrchat")).toBe(true);
    expect(isUsePurpose("")).toBe(false);
    expect(isUsePurpose("<script>")).toBe(false);
    expect(isUsePurpose(undefined)).toBe(false);
  });

  it("表示名は言語で切り替わり、未知の値は空", () => {
    expect(purposeLabel("game")).toBe("ゲーム制作");
    expect(purposeLabel("game", "en")).toBe("Game development");
    expect(purposeLabel("unknown")).toBe("");
  });

  it("会社名は空白を取り、120文字で切る", () => {
    expect(cleanBuyerCompany("  KWI株式会社 ")).toBe("KWI株式会社");
    expect(cleanBuyerCompany("a".repeat(200))).toHaveLength(120);
    expect(cleanBuyerCompany(null)).toBe("");
  });

  it("リクエストから用途を読む。用途が無ければ null、案内メールは true のときだけ同意", () => {
    expect(parsePurchaseIntake({})).toBeNull();
    expect(parsePurchaseIntake({ usePurpose: "nope" })).toBeNull();
    expect(parsePurchaseIntake({ usePurpose: "video", buyerCompany: " 制作会社 ", marketingConsent: "yes" })).toEqual({
      usePurpose: "video",
      buyerCompany: "制作会社",
      marketingConsent: false,
    });
    expect(parsePurchaseIntake({ usePurpose: "game", marketingConsent: true })?.marketingConsent).toBe(true);
  });
});
