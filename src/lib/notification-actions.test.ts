import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "self" } as { id: string } | null, admin: false, mark: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./dal", () => ({ getCurrentUser: async () => state.user, requireAdmin: async () => { state.requireAdmin(); if (!state.admin) throw Error("forbidden"); return { id: "self" }; } }));
vi.mock("./notifications", () => ({ markAllRead: state.mark }));
import { markNotificationsReadAction } from "./notification-actions";
beforeEach(() => { state.user = { id: "self" }; state.admin = false; vi.clearAllMocks(); });
it("uses the session recipient for personal notifications", async () => {
  await markNotificationsReadAction("user"); expect(state.mark).toHaveBeenCalledWith("self", "user");
});
it("rejects admin read attempts without admin authorization", async () => {
  await expect(markNotificationsReadAction("admin")).rejects.toThrow("forbidden"); expect(state.mark).not.toHaveBeenCalled();
});
it("marks authorized admin scope only", async () => {
  state.admin = true; await markNotificationsReadAction("admin"); expect(state.requireAdmin).toHaveBeenCalled(); expect(state.mark).toHaveBeenCalledWith("self", "admin");
});
it("does not write anonymously or for an invalid scope", async () => {
  state.user = null; await markNotificationsReadAction("user");
  await expect(markNotificationsReadAction("all" as "user")).rejects.toThrow();
  expect(state.mark).not.toHaveBeenCalled();
});
