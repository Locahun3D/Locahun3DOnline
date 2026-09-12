import { expect, it, vi } from "vitest";
const reads = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dal", () => ({ requireAdmin: async () => { throw Error("admin required"); } }));
vi.mock("@/lib/notifications", () => ({ getNotificationSummary: reads }));
vi.mock("@/lib/i18n/server", () => ({ getLocale: async () => "ja" }));
vi.mock("@/components/account/notification-list", () => ({ default: () => null }));
import AdminNotificationsPage from "./page";
it("requires admin before reading notification bodies", async () => {
  await expect(AdminNotificationsPage()).rejects.toThrow("admin required");
  expect(reads).not.toHaveBeenCalled();
});
