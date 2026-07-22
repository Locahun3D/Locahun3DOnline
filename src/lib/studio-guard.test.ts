import { describe, it, expect } from "vitest";
import { protectStudioManagedFields } from "./studio-guard";
import type { Property } from "./schemas";

/** 最小限の Property を作るヘルパ（必要な欄だけ上書き）。 */
function prop(over: Partial<Property>): Property {
  return {
    splatUrl: "",
    zipUrl: "",
    zipSizeMb: 0,
    splatSizeMb: 0,
    splatItems: [],
    status: "draft",
    publishRequestedAt: null,
    ...over,
  } as Property;
}

describe("protectStudioManagedFields", () => {
  it("studio の保存では 3DGS 系フィールドを既存値で上書きする", () => {
    const incoming = prop({
      splatUrl: "evil.splat",
      splatSizeMb: 999,
      zipUrl: "evil.zip",
      zipSizeMb: 999,
      splatItems: [{ id: "x" }] as Property["splatItems"],
    });
    const existing = prop({
      splatUrl: "real.splat",
      splatSizeMb: 12,
      zipUrl: "real.zip",
      zipSizeMb: 34,
      splatItems: [],
    });

    const out = protectStudioManagedFields(incoming, existing, "studio");

    expect(out.splatUrl).toBe("real.splat");
    expect(out.splatSizeMb).toBe(12);
    expect(out.zipUrl).toBe("real.zip");
    expect(out.zipSizeMb).toBe(34);
    expect(out.splatItems).toEqual([]);
  });

  it("admin の保存では 3DGS 系フィールドをそのまま通す", () => {
    const incoming = prop({ splatUrl: "new.splat", splatSizeMb: 50 });
    const existing = prop({ splatUrl: "old.splat", splatSizeMb: 10 });

    const out = protectStudioManagedFields(incoming, existing, "admin");

    expect(out.splatUrl).toBe("new.splat");
    expect(out.splatSizeMb).toBe(50);
  });

  it("studio は status と publishRequestedAt を書き換えられない", () => {
    const incoming = prop({ status: "published", publishRequestedAt: "2026-01-01T00:00:00.000Z" });
    const existing = prop({ status: "draft", publishRequestedAt: null });

    const out = protectStudioManagedFields(incoming, existing, "studio");

    expect(out.status).toBe("draft");
    expect(out.publishRequestedAt).toBeNull();
  });

  it("既存が無い（新規作成直後）場合も studio の 3DGS 欄は空にする", () => {
    const incoming = prop({ splatUrl: "evil.splat", splatSizeMb: 999 });

    const out = protectStudioManagedFields(incoming, null, "studio");

    expect(out.splatUrl).toBe("");
    expect(out.splatSizeMb).toBe(0);
  });
});
