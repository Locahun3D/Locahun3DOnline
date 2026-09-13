import { createElement, isValidElement, type ReactNode, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/account-schema";
import { userSchema } from "@/lib/account-schema";

// Client leaves have server-action dependencies; this test checks server composition,
// while the browser fixture exercises their actual interactive implementations.
vi.mock("./display-name-editor", () => ({ default: () => null }));
vi.mock("./redeem-gift", () => ({ default: () => null }));
vi.mock("./nda-consent-modal", () => ({ default: () => null }));
vi.mock("./marketing-consent-toggle", () => ({ default: () => null }));
vi.mock("./notification-list", () => ({ default: () => null }));
vi.mock("@/lib/subscribe-actions", () => ({ openBillingPortalAction: vi.fn() }));
import AccountDashboard from "./account-dashboard";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
const user = userSchema.parse({ id: "fixture", displayName: "確認ユーザー", name: "確認", email: "test@example.test", role: "admin", status: "active", plan: "free", bookmarks: [], tokenBalance: 6, bonusTokens: 0, purchasedTokens: 0, marketingConsent: false });
function dashboard(role: PublicUser["role"] = "admin") {
  return AccountDashboard({ user: {...user, role}, locale: "ja", boardTiles: [], totalBoardCount: 0, lastUnlock: null, lastUnlockProperty: null, lastUnlockSceneLabel: "", unlockedCount: 0, nowIso: "2026-09-12T00:00:00Z", ...{loginDevices: createElement("div", {"data-device-fixture": true}), adminNotificationUnreadCount: 17} });
}
describe("account work-first composition", () => {
  it("keeps saved/history/device access together before subscription controls", () => {
    const tree=elements(dashboard());
    const work=tree.find(e=>e.props["data-account-region"] === "work");
    expect(work).toBeDefined();
    const children=elements(work);
    expect(children.some(e=>e.props.href==="/dashboard/bookmarks")).toBe(true);
    expect(children.some(e=>e.props.href==="/dashboard/unlocked")).toBe(true);
    expect(children.some(e=>e.props["data-device-fixture"])).toBe(true);
    expect(children.some(e=>e.props.href==="/pricing")).toBe(false);
  });
  it("shows independently counted admin entry only for administrators", () => {
    const entry=elements(dashboard()).find(e=>e.props.href==="/admin/notifications");
    expect(entry).toBeDefined();
    expect(elements(entry).some(e=>e.props.children===17)).toBe(true);
    expect(elements(dashboard("individual")).some(e=>e.props.href==="/admin/notifications")).toBe(false);
  });
});
