import { beforeEach, expect, it, vi } from "vitest";
import { propertySchema } from "@/lib/schemas";

const { getProperty, getUser } = vi.hoisted(() => ({ getProperty: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/store", () => ({ repo: { get: getProperty } }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: getUser }));
vi.mock("@/lib/purchases", () => ({ purchaseRepo: { hasPurchased: async () => false } }));
import { POST } from "./route";
beforeEach(()=>{ getUser.mockReset(); getUser.mockResolvedValue(null); });

const team = { id: 'viewer', role: 'production', status: 'active', plan: 'team', ndaAcceptedAt: '2026-09-01' };
it.each([
 { name:'anonymous public', allowed:true },
 { name:'draft', status:'draft', allowed:false },
 { name:'archived', status:'archived', allowed:false },
 { name:'missing property', missing:true, allowed:false },
 { name:'missing item', index:1, allowed:false },
 { name:'missing splat URL', splatUrl:'', allowed:false },
 { name:'anonymous confidential', visibility:'confidential', allowed:false },
 { name:'NDA production confidential', visibility:'confidential', user:team, allowed:true },
 { name:'revoked confidential account', visibility:'confidential', user:{...team,status:'suspended'}, allowed:false },
 { name:'anonymous restricted', accessLevel:'restricted', allowed:false },
 { name:'team restricted', accessLevel:'restricted', user:team, allowed:true },
 { name:'downgraded restricted', accessLevel:'restricted', user:{...team,plan:'free'}, allowed:false },
 { name:'anonymous NDA scene', accessLevel:'nda_only', allowed:false },
 { name:'team NDA scene', accessLevel:'nda_only', user:team, allowed:true },
 { name:'withdrawn NDA', accessLevel:'nda_only', user:{...team,ndaAcceptedAt:''}, allowed:false },
 { name:'inactive admin', accessLevel:'nda_only', user:{...team,role:'admin',status:'suspended'}, allowed:false },
 { name:'active admin', accessLevel:'nda_only', user:{...team,role:'admin',plan:'free'}, allowed:true },
 { name:'not for sale', forSale:false, allowed:true },
 { name:'custom page without viewer', blocks:[{id:'text',kind:'text',body:'Description'}], allowed:false },
 { name:'custom page with viewer', blocks:[{id:'viewer',kind:'splat'}], allowed:true },
])('returns only a gated property-page link: $name', async (scenario)=>{
 getUser.mockResolvedValue(scenario.user ?? null);
 getProperty.mockResolvedValue(scenario.missing ? null : propertySchema.parse({id:'place space',category:'warehouse',cover:{src:'',alt:''},status:scenario.status??'published',visibility:scenario.visibility??'public',pageBlocks:scenario.blocks??[],splatItems:[{id:'floor/2',splatUrl:scenario.splatUrl??'/private/raw.splat',accessLevel:scenario.accessLevel??'public',forSale:scenario.forSale??true,downloadFileUrl:'/private/download.rad',salePrice:100}]}));
 const response=await POST(new Request('http://localhost/api/cart/prices',{method:'POST',body:JSON.stringify({items:[{propertyId:'place space',splatItemIndex:scenario.index??0}]})}));
 const data=await response.json();
 expect(data.items[0].viewerHref).toBe(scenario.allowed?'/properties/place%20space?scene=floor%2F2#walkthrough':null);
 expect(JSON.stringify(data)).not.toMatch(/private|raw\.splat|download\.rad|embed|signature/);
 expect(getUser).toHaveBeenCalledTimes(1);
 if(scenario.forSale===false) expect(data.items[0].available).toBe(false);
});

it("returns current included files and the resolved license without storage URLs", async () => {
  getProperty.mockResolvedValue(propertySchema.parse({ id: "test", category: "warehouse", cover: { src: "", alt: "" }, splatItems: [{ id: "floor", forSale: true, downloadFileUrl: "/private/scan.rad", downloadFileFormat: "RAD", downloadFileSizeMb: 125, license: "extended", salePrice: 1500 }] }));
  const response = await POST(new Request("http://localhost/api/cart/prices", { method: "POST", body: JSON.stringify({ items: [{ propertyId: "test", splatItemIndex: 0 }] }) }));
  const data = await response.json();
  expect(data.items[0]).toMatchObject({ available: true, license: "extended", purchaseContents: [{ format: "RAD", sizeMb: 125, date: "", kind: "file" }] });
  expect(JSON.stringify(data)).not.toContain("private");
});
