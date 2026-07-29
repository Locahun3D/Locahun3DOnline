import { describe, it, expect } from "vitest";
import {
  canCreateListing,
  listingStep,
  ownsProperty,
  resolveListingPrefill,
  canConvertToStudio,
} from "./listing-funnel";

const studio = { id: "u1", role: "studio", name: "スタジオA" };
const other = { id: "u2", role: "studio", name: "スタジオB" };
const individual = { id: "u3", role: "individual", name: "個人" };
const admin = { id: "u4", role: "admin", name: "運営" };
const prop = { id: "wh-002", ownerId: "u1", title: "白ホリA", prefecture: "東京都", city: "渋谷区" };

describe("canCreateListing", () => {
  it("studio と admin だけが掲載ページを作れる", () => {
    expect(canCreateListing("studio")).toBe(true);
    expect(canCreateListing("admin")).toBe(true);
    expect(canCreateListing("individual")).toBe(false);
    expect(canCreateListing("production")).toBe(false);
    expect(canCreateListing(undefined)).toBe(false);
  });
});

describe("listingStep", () => {
  it("未ログインはアカウント作成から始まる", () => {
    expect(listingStep(null, false)).toBe("signup");
  });
  it("個人・制作会社は別アカウント作成へ案内する", () => {
    expect(listingStep("individual", false)).toBe("switch");
    expect(listingStep("production", false)).toBe("switch");
  });
  it("スタジオ・管理者は物件ページ作成へ進む", () => {
    expect(listingStep("studio", false)).toBe("create");
    expect(listingStep("admin", false)).toBe("create");
  });
  it("物件を持って来ていれば常に公開申請モード", () => {
    expect(listingStep("studio", true)).toBe("request");
    expect(listingStep("admin", true)).toBe("request");
  });
});

describe("ownsProperty", () => {
  it("所有者本人は許可", () => {
    expect(ownsProperty(studio, prop)).toBe(true);
  });
  it("紐づけ済みなら ownerId が違っても許可", () => {
    expect(ownsProperty({ ...other, linkedPropertyIds: ["wh-002"] }, prop)).toBe(true);
  });
  it("他人のスタジオは拒否（?property= を書き換えても通らない）", () => {
    expect(ownsProperty(other, prop)).toBe(false);
  });
  it("個人アカウントは自分がownerIdでも拒否（掲載権限が無い）", () => {
    expect(ownsProperty({ ...individual, id: "u1" }, prop)).toBe(false);
  });
  it("admin は全件許可", () => {
    expect(ownsProperty(admin, prop)).toBe(true);
  });
  it("未ログイン・物件なしは拒否", () => {
    expect(ownsProperty(null, prop)).toBe(false);
    expect(ownsProperty(studio, null)).toBe(false);
  });
  it("ownerId が空の物件を id 一致で誤許可しない", () => {
    expect(ownsProperty(studio, { id: "wh-002", ownerId: "" })).toBe(false);
  });
});

describe("resolveListingPrefill", () => {
  it("所有者には物件データから初期値を作る", () => {
    expect(resolveListingPrefill(studio, prop)).toEqual({
      propertyId: "wh-002",
      company: "スタジオA",
      propertyName: "白ホリA",
      address: "東京都渋谷区",
    });
  });
  it("所有していなければ undefined（他人の物件名を覗けない）", () => {
    expect(resolveListingPrefill(other, prop)).toBeUndefined();
    expect(resolveListingPrefill(individual, prop)).toBeUndefined();
    expect(resolveListingPrefill(null, prop)).toBeUndefined();
  });
  it("欠けている項目は空文字で埋める（undefined を混ぜない）", () => {
    expect(resolveListingPrefill({ id: "u1", role: "studio" }, { id: "p", ownerId: "u1" })).toEqual({
      propertyId: "p",
      company: "",
      propertyName: "",
      address: "",
    });
  });
});

describe("canConvertToStudio — 今のアカウントをそのままスタジオにできるか", () => {
  it("個人アカウント＋会社ドメインなら切り替えられる", () => {
    expect(canConvertToStudio("individual", false)).toBe(true);
  });

  it("個人アカウントでもフリーメールなら切り替えさせない", () => {
    expect(canConvertToStudio("individual", true)).toBe(false);
  });

  it("制作会社は対象外（NDA権限を失うため別アカウントへ案内する）", () => {
    expect(canConvertToStudio("production", false)).toBe(false);
  });

  it("すでにスタジオ／管理者、未ログインは対象外", () => {
    expect(canConvertToStudio("studio", false)).toBe(false);
    expect(canConvertToStudio("admin", false)).toBe(false);
    expect(canConvertToStudio(null, false)).toBe(false);
    expect(canConvertToStudio(undefined, false)).toBe(false);
  });
});
