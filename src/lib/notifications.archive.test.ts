import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ notifications: [] as unknown[], contacts: [] as unknown[], inquiries: [] as unknown[] }));
vi.mock("node:fs", () => ({ promises: { readFile: async () => JSON.stringify({ notifications: state.notifications }) } }));
vi.mock("./fs-safe", () => ({ canAccessLocalFs: () => true, safeWriteFile: vi.fn() }));
vi.mock("./contact-requests", () => ({ contactRequestRepo: { list: async () => state.contacts } }));
vi.mock("./inquiries", () => ({ inquiryRepo: { list: async () => state.inquiries } }));
import { listNotifications } from "./notifications";
const notice = (id: string, link: string, type = "contact_request") => ({ id, userId: "admin", type, title: "new", body: "A さん: hello", link, read: false, createdAt: "2026-09-12T01:00:00Z" });
beforeEach(() => { state.notifications = []; state.contacts = []; state.inquiries = []; });
it("hides archived source notifications before applying the display limit", async () => {
  state.contacts = [{ id: "a", status: "archived", name: "A", message: "hello" }, { id: "b", status: "new", name: "B", message: "active" }];
  state.notifications = [notice("1", "/admin/contact-requests#a"), notice("2", "/admin/contact-requests#b")];
  expect((await listNotifications("admin", 1)).map(n => n.id)).toEqual(["2"]);
});
it("hides old unlinked archived contact notices without erasing unrelated notices", async () => {
  state.contacts = [{ id: "a", status: "archived", name: "A", message: "hello" }];
  state.notifications = [notice("1", "/admin/contact-requests"), notice("2", "/account", "policy_update")];
  expect((await listNotifications("admin")).map(n => n.id)).toEqual(["2"]);
});
it("keeps ambiguous legacy notifications when an identical inquiry is still active", async () => {
  state.contacts = [{ id: "a", status: "archived", name: "A", message: "hello" }, { id: "b", status: "new", name: "A", message: "hello" }];
  state.notifications = [notice("1", "/admin/contact-requests")];
  expect((await listNotifications("admin")).length).toBe(1);
});
it("hides archived property inquiry notifications and restores them when unarchived", async () => {
  const row = { id: "i", status: "archived", name: "A", propertyTitle: "Room", message: "hello" };
  state.inquiries = [row];
  state.notifications = [notice("1", "/admin/inquiries#i", "inquiry_new")];
  expect(await listNotifications("admin")).toEqual([]);
  row.status = "read";
  expect((await listNotifications("admin")).length).toBe(1);
});
