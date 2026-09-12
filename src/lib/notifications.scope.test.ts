import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ notifications: [] as Record<string, unknown>[], contacts: [] as Record<string, unknown>[], local: true, updates: [] as unknown[][], batchSizes: [] as number[], batchFailure: false }));
vi.mock("node:fs", () => ({ promises: { readFile: async () => JSON.stringify({ notifications: state.notifications }) } }));
vi.mock("./fs-safe", () => ({ canAccessLocalFs: () => state.local, safeWriteFile: async (_: string, content: string) => { state.notifications = JSON.parse(content).notifications; } }));
vi.mock("./contact-requests", () => ({ contactRequestRepo: { list: async () => state.contacts } }));
vi.mock("./inquiries", () => ({ inquiryRepo: { list: async () => [] } }));
vi.mock("./d1", () => ({ getD1: async () => ({ batch: async (statements: { run: () => Promise<void> }[]) => { state.batchSizes.push(statements.length); if (state.batchFailure) throw Error("transaction rolled back"); for (const s of statements) await s.run(); }, prepare: (sql: string) => ({ bind: (...values: unknown[]) => ({ all: async () => ({ results: state.notifications.filter(n => n.userId === values[0]).map(n => ({ ...n, user_id: n.userId, created_at: n.createdAt })) }), run: async () => { state.updates.push([sql, ...values]); for (const n of state.notifications) if (n.userId === values[0] && values.slice(1).includes(n.id)) n.read = true; } }) }) }) }));
import { getNotificationSummary, markAllRead } from "./notifications";
const notice = (id: string, type = "policy_update", userId = "owner") => ({ id, userId, type, title: id, body: "A さん: hello", link: type === "contact_request" ? `/admin/contact-requests#${id}` : type === "publish_request" ? "/admin/properties/p/edit" : "/account", read: false, createdAt: id });
beforeEach(() => { state.notifications = []; state.contacts = []; state.local = true; state.updates = []; state.batchSizes = []; state.batchFailure = false; });
it("separates personal and admin notices before limits and counts beyond thirty", async () => {
  state.notifications = [...Array.from({ length: 40 }, (_, i) => notice(`u${i}`)), ...Array.from({ length: 40 }, (_, i) => notice(`a${i}`, "publish_request")), notice("other", "policy_update", "other")];
  const user = await getNotificationSummary("owner", "user", 6);
  const admin = await getNotificationSummary("owner", "admin", 8);
  expect(user.unreadCount).toBe(40); expect(user.notifications).toHaveLength(6);
  expect(user.notifications.every(n => n.type === "policy_update")).toBe(true);
  expect(admin.unreadCount).toBe(40); expect(admin.notifications).toHaveLength(8);
  expect(admin.notifications.every(n => n.type === "publish_request")).toBe(true);
});
it("marks only the selected scope for the authenticated recipient", async () => {
  state.notifications = [notice("u"), notice("a", "publish_request"), notice("other", "policy_update", "other")];
  await markAllRead("owner", "user");
  expect(state.notifications.map(n => n.read)).toEqual([true, false, false]);
  await markAllRead("owner", "admin");
  expect(state.notifications.map(n => n.read)).toEqual([true, true, false]);
});
it("keeps archived notices hidden and unread until restored", async () => {
  const row = { id: "a", status: "archived", name: "A", message: "hello" };
  state.contacts = [row]; state.notifications = [notice("a", "contact_request")];
  expect((await getNotificationSummary("owner", "admin")).unreadCount).toBe(0);
  await markAllRead("owner", "admin");
  expect(state.notifications[0].read).toBe(false);
  row.status = "new";
  expect((await getNotificationSummary("owner", "admin")).unreadCount).toBe(1);
});
it("D1 read updates bind the recipient and selected notification IDs only", async () => {
  state.local = false;
  state.notifications = [notice("u"), notice("a", "publish_request"), notice("other", "policy_update", "other")];
  await markAllRead("owner", "admin");
  expect(state.updates).toHaveLength(1);
  expect(state.updates[0].slice(1)).toEqual(["owner", "a"]);
});
it("sends more than ninety read updates in one D1 transaction, not independent writes", async () => {
  state.local = false;
  state.notifications = Array.from({ length: 91 }, (_, i) => notice(`a${i}`, "publish_request"));
  await markAllRead("owner", "admin");
  expect(state.batchSizes).toEqual([2]);
  expect(state.updates.flatMap(u => u.slice(2))).toHaveLength(91);
});
it("propagates a failed D1 transaction without independent partial read writes", async () => {
  state.local = false; state.batchFailure = true;
  state.notifications = Array.from({ length: 91 }, (_, i) => notice(`a${i}`, "publish_request"));
  await expect(markAllRead("owner", "admin")).rejects.toThrow("transaction rolled back");
  expect(state.updates).toEqual([]);
  expect(state.notifications.every(n => n.read === false)).toBe(true);
});
