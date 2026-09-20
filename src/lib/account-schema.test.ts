import { describe, it, expect } from "vitest";
import { isStudioPurchaseRestricted, canShareViewerLink, type PublicUser } from "./account-schema";

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

describe("canShareViewerLink（ビューアーの共有URLは最上位プランの機能）", () => {
  const u = (o: Partial<PublicUser>) => ({ status: "active", role: "production", plan: "free", ...o }) as PublicUser;
  it("Team プランだけが発行できる", () => {
    expect(canShareViewerLink(u({ plan: "team" }))).toBe(true);
    expect(canShareViewerLink(u({ plan: "studio" }))).toBe(false);
    expect(canShareViewerLink(u({ plan: "individual" }))).toBe(false);
    expect(canShareViewerLink(u({ plan: "free" }))).toBe(false);
  });
  it("管理者は常に可。未ログイン・停止中は不可", () => {
    expect(canShareViewerLink(u({ role: "admin", plan: "free" }))).toBe(true);
    expect(canShareViewerLink(null)).toBe(false);
    expect(canShareViewerLink(u({ plan: "team", status: "suspended" as PublicUser["status"] }))).toBe(false);
  });
});
