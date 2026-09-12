import { beforeEach, expect, it, vi } from "vitest";
import { propertySchema, type Property } from "@/lib/schemas";

const storage = vi.hoisted(() => ({ property: null as Property | null, writes: 0, duringTranslation: null as (() => void) | null }));
vi.mock("@/lib/store", () => ({
  repo: {
    get: async () => storage.property,
    upsert: async (p: Property) => {
      storage.writes++;
      storage.property = { ...p, updatedAt: "2026-09-12T01:00:00.000Z" };
      return storage.property;
    },
  },
  assetRepo: {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: async () => ({ id: "admin", role: "admin" }), requireAdmin: async () => {}, requireAdminOrStudioOwner: async () => {} }));
vi.mock("@/lib/users", () => ({ userRepo: {} }));
vi.mock("@/lib/purchases", () => ({ purchaseRepo: {} }));
vi.mock("@/lib/inquiries", () => ({ inquiryRepo: {} }));
vi.mock("@/lib/uploads", () => ({ deleteR2Object: () => {}, getUploadMode: () => "local" }));
vi.mock("@/lib/notifications", () => ({ createNotification: () => {} }));
vi.mock("@/lib/payouts", () => ({ renamePayoutRecordsForProperty: () => {}, autoCreateStudioVenueSplit: () => {} }));
vi.mock("@/lib/property-translate", () => ({ fillPropertyEnglish: async (p: Property) => { storage.duringTranslation?.(); return { ...p, titleEn: p.titleEn || "Generated title" }; }, needsEnglish: () => false }));
import { saveDraftAction, publishAction, unpublishAction } from "./_actions";

beforeEach(() => {
  storage.writes = 0;
  storage.duringTranslation = null;
  storage.property = propertySchema.parse({ id: "conflict-test", title: "Server title", category: "studio", cover: {}, updatedAt: "2026-09-12T00:00:00.000Z" });
});

it("rejects a genuinely stale editor without changing the saved property", async () => {
  const response = await saveDraftAction({ ...storage.property, title: "Stale title" }, { expectedUpdatedAt: "2026-09-11T00:00:00.000Z" });
  expect(response).toMatchObject({ ok: false, conflict: true });
  expect(storage.property?.title).toBe("Server title");
  expect(storage.writes).toBe(0);
});

it("returns the new version for the next serialized autosave", async () => {
  const first = await saveDraftAction({ ...storage.property, title: "First edit" }, { expectedUpdatedAt: "2026-09-12T00:00:00.000Z" });
  expect(first.ok).toBe(true);
  if (!first.ok) throw new Error("first save unexpectedly conflicted");
  expect(first.updatedAt).toBe("2026-09-12T01:00:00.000Z");
  const second = await saveDraftAction({ ...storage.property, title: "Second edit" }, { expectedUpdatedAt: first.updatedAt });
  expect(second.ok).toBe(true);
  expect(storage.property?.title).toBe("Second edit");
});

function publishable() {
  return { ...storage.property, area: "東京", prefecture: "東京都", city: "渋谷区", summary: "テスト用の紹介文を入力しています。", hourlyPrice: 1000, urlConfirmedAt: "2026-09-12T00:00:00.000Z", cover: { src: "/test.jpg", alt: "全景" } };
}

it("publishing rejects another editor's newer version without overwriting it", async () => {
  const result = await publishAction(publishable(), { expectedUpdatedAt: "stale" });
  expect(result).toMatchObject({ ok: false, conflict: true });
  expect(storage.writes).toBe(0);
});

it("publishing returns the committed version so the next autosave does not conflict with itself", async () => {
  const result = await publishAction(publishable(), { expectedUpdatedAt: "2026-09-12T00:00:00.000Z" });
  expect(result).toMatchObject({ ok: true, updatedAt: "2026-09-12T01:00:00.000Z", status: "published", property: { titleEn: "Generated title" } });
});

it("unpublishing rejects a stale editor", async () => {
  const result = await unpublishAction("conflict-test", { expectedUpdatedAt: "stale" });
  expect(result).toMatchObject({ ok: false, conflict: true });
  expect(storage.writes).toBe(0);
});

it("unpublishing returns the committed version and draft status", async () => {
  const result = await unpublishAction("conflict-test", { expectedUpdatedAt: "2026-09-12T00:00:00.000Z" });
  expect(result).toMatchObject({ ok: true, updatedAt: "2026-09-12T01:00:00.000Z", status: "draft" });
});

it("does not overwrite another editor's update made while publication is translating", async () => {
  storage.duringTranslation = () => {
    storage.property = { ...storage.property!, title: "Other editor", updatedAt: "2026-09-12T00:30:00.000Z" };
  };
  const result = await publishAction(publishable(), { expectedUpdatedAt: "2026-09-12T00:00:00.000Z" });
  expect(result).toMatchObject({ ok: false, conflict: true });
  expect(storage.writes).toBe(0);
  expect(storage.property?.title).toBe("Other editor");
});
