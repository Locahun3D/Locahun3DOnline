import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ remove: vi.fn(), usage: { "/used.ply": ["p"] } as Record<string, string[]> }));
vi.mock('@/lib/d1',()=>({getD1:async()=>({prepare:()=>({bind:()=>({first:async()=>({binding:JSON.stringify({purpose:'scene-edit-v1'})})})})})}));
vi.mock("@/lib/dal", () => ({ requireAdmin: async () => ({ id: "admin" }) }));
vi.mock("@/lib/store", () => ({ assetRepo: { get: async (id: string) => ({ id, url: `/${id}.ply` }), list: async () => [], remove: state.remove }, repo: { list: async () => [] } }));
vi.mock("@/lib/asset-usage", () => ({ computeAssetUsage: (_p:unknown,_a:unknown,options?:{historyOnly?:boolean}) => options?.historyOnly ? {'/recovery.ply':['p']} : state.usage }));
import { POST } from "./route";
it('protects an immutable scene-edit reservation from unused cleanup before attachment',async()=>{
 state.remove.mockClear();
 const response=await POST(new Request('http://local/api/admin/assets/update',{method:'POST',body:JSON.stringify({action:'delete',id:'wf_'+'a'.repeat(64),unusedOnly:true})}));
 expect(response.status).toBe(409);expect(state.remove).not.toHaveBeenCalled();
});
it('rejects explicit deletion of a referenced recovery source',async()=>{
 state.remove.mockClear();const response=await POST(new Request('http://local/api/admin/assets/update',{method:'POST',body:JSON.stringify({action:'delete',id:'recovery'})}));
 expect(response.status).toBe(409);expect(state.remove).not.toHaveBeenCalled();
});
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
