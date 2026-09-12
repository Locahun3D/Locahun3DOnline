import { beforeEach, expect, it, vi } from "vitest";
import { propertySchema } from "@/lib/schemas";
import { userSchema } from "@/lib/account-schema";
const fixture = vi.hoisted(() => ({ status: "draft", free: false, deny: false }));
vi.mock("@/lib/dal", () => ({ requireAdmin: async () => {
  if (fixture.deny) throw new Error("forbidden");
  return userSchema.parse({ id: "admin", email: "admin@example.test", name: "Admin", role: "admin" });
} }));
vi.mock("@/lib/store", () => ({ repo: {
  get: async () => propertySchema.parse({ id: "preview-test", category: "studio", cover: {}, status: fixture.status }),
  list: async () => [],
} }));
vi.mock("@/lib/site-settings", () => ({ getSettings: async () => ({ freePeriod: {} }) }));
vi.mock("@/lib/settings-schema", async (original) => ({ ...await original<typeof import("@/lib/settings-schema")>(), isFreePeriodActive: () => fixture.free }));
vi.mock("@/components/property-detail-view", () => ({ default: () => null }));
vi.mock("@/components/admin/plan-preview-switcher", () => ({ default: () => null }));
import Page from "./page";

beforeEach(() => { fixture.status = "draft"; fixture.free = false; fixture.deny = false; });

for (const status of ["draft", "published"]) for (const free of [false, true]) {
  for (const [plan, signedIn, restricted, nda, admin] of [
    ["admin", true, true, true, true], ["guest", false, false, false, false],
    ["free", true, false, false, false], ["individual", true, false, false, false],
    ["studio", true, false, false, false], ["team", true, true, false, false],
    ["team_nda", true, true, true, false],
  ] as const) {
    it(`${status}/${plan}/free=${free} matches public permission flags without changing real authorization`, async () => {
      fixture.status = status; fixture.free = free;
      const result = await Page({ params: Promise.resolve({ id: "preview-test" }), searchParams: Promise.resolve({ plan }) });
      expect(result.props).toMatchObject({ signedIn, hasViewerAccess: signedIn, canViewRestricted: restricted, canViewNdaOnly: nda, isAdminUser: admin, displaySimulation: !admin, freeAccess: free });
    });
  }
}

it("does not allow non-admin access through a simulated plan", async () => {
  fixture.deny = true;
  await expect(Page({ params: Promise.resolve({ id: "preview-test" }), searchParams: Promise.resolve({ plan: "team_nda" }) })).rejects.toThrow("forbidden");
});
