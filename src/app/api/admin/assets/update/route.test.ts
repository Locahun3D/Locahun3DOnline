import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ remove: vi.fn(), usage: { "/used.ply": ["p"] } as Record<string, string[]> }));
vi.mock("@/lib/dal", () => ({ requireAdmin: async () => ({ id: "admin" }) }));
vi.mock("@/lib/store", () => ({ assetRepo: { get: async (id: string) => ({ id, url: `/${id}.ply` }), list: async () => [], remove: state.remove }, repo: { list: async () => [] } }));
vi.mock("@/lib/asset-usage", () => ({ computeAssetUsage: () => state.usage }));
import { POST } from "./route";
it("rejects an asset that became used since the unused list was opened", async () => {
  state.remove.mockClear();
  const response = await POST(new Request("http://local/api/admin/assets/update", { method: "POST", body: JSON.stringify({ action: "delete", id: "used", unusedOnly: true }) }));
  expect(response.status).toBe(409);
  expect(state.remove).not.toHaveBeenCalled();
});
it("deletes an asset confirmed unused at the server", async () => {
  state.remove.mockClear();
  const response = await POST(new Request("http://local/api/admin/assets/update", { method: "POST", body: JSON.stringify({ action: "delete", id: "unused", unusedOnly: true }) }));
  expect(response.status).toBe(200);
  expect(state.remove).toHaveBeenCalledWith("unused");
});
