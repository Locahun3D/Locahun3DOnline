import { describe, it, expect } from "vitest";
import { isStudioPurchaseRestricted } from "./account-schema";

describe("isStudioPurchaseRestricted", () => {
  it("撮影スタジオは購入・サブスクの対象外", () => {
    expect(isStudioPurchaseRestricted("studio")).toBe(true);
  });

  it("それ以外のロールは制限されない", () => {
    expect(isStudioPurchaseRestricted("individual")).toBe(false);
    expect(isStudioPurchaseRestricted("production")).toBe(false);
    expect(isStudioPurchaseRestricted("guest")).toBe(false);
    expect(isStudioPurchaseRestricted("admin")).toBe(false);
  });

  it("未ログイン/不正値は制限しない（呼び出し側の未ログイン判定に任せる）", () => {
    expect(isStudioPurchaseRestricted(undefined)).toBe(false);
    expect(isStudioPurchaseRestricted(null)).toBe(false);
    expect(isStudioPurchaseRestricted("")).toBe(false);
  });
});
