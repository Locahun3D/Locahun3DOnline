import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  get: vi.fn(), head: vi.fn(), user: vi.fn(), properties: vi.fn(), settings: vi.fn(),
  free: vi.fn(), admin: vi.fn(), cancel: vi.fn(),
}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({env:{R2_ASSETS:{get:mocks.get,head:mocks.head}}}) }));
vi.mock("@/lib/dal", () => ({getCurrentUser:mocks.user,requireAdmin:mocks.admin}));
vi.mock("@/lib/store", () => ({repo:{list:mocks.properties}}));
vi.mock("@/lib/site-settings", () => ({getSettings:mocks.settings}));
vi.mock("@/lib/settings-schema", () => ({isFreePeriodActive:mocks.free}));

import * as demo from "./demo-asset/[...path]/route";
import * as viewer from "./viewer-stream/[...path]/route";
import * as r2 from "./r2/[...path]/route";

const uploaded = new Date("2026-09-01T12:00:00Z");
const routes = [
  {name:"demo-asset", route:demo, key:"Kousaten_ForDemo_point_cloud.rad", cache:"public, max-age=86400"},
  {name:"viewer-stream", route:viewer, key:"uploads/scan.rad", cache:"no-store"},
  {name:"r2", route:r2, key:"uploads/image.png", cache:"public, max-age=3600, stale-while-revalidate=86400"},
];
function object(etag = '"multipart-6"') {
  return {size:10,httpEtag:etag,etag:"wrong-unquoted-tag",uploaded,httpMetadata:{contentType:"image/png"}};
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({role:"admin",plan:"individual"});
  mocks.properties.mockResolvedValue([]);
  mocks.settings.mockResolvedValue({freePeriod:{}});
  mocks.free.mockReturnValue(false);
  mocks.head.mockImplementation(async () => object());
  mocks.get.mockImplementation(async (_key, options) => {
    const bytes = new Uint8Array(options?.range ? [2,3] : [0,1,2,3,4,5,6,7,8,9]);
    return {...object(),range:options?.range ? {offset:2,length:2} : undefined,
      body:new ReadableStream({start(c){c.enqueue(bytes); c.close();},cancel:mocks.cancel}),
      arrayBuffer:async () => bytes.buffer};
  });
});
afterEach(() => vi.unstubAllGlobals());
function request(name: string, key: string, method: string, range?: string) {
  return new NextRequest(`https://locahun3d.com/api/${name}/${key}`, {method,headers:range ? {Range:range} : {}});
}
const context = (key: string) => ({params:Promise.resolve({path:key.split("/")})});

describe.each(routes)("$name identity", ({name,route,key,cache}) => {
  for (const method of ["GET","HEAD"] as const) for (const range of [undefined,"bytes=2-3"]) {
    it(`${method} ${range || "full"} retains full-object identity and response headers`, async () => {
      expect(route[method]).toBeTypeOf("function");
      const res = await route[method](request(name,key,method,range),context(key));
      expect(res.status).toBe(range ? 206 : 200);
      expect(res.headers.get("etag")).toBe('"multipart-6"');
      expect(res.headers.get("last-modified")).toBe(uploaded.toUTCString());
      expect(res.headers.get("content-length")).toBe(range ? "2" : "10");
      expect(res.headers.get("accept-ranges")).toBe("bytes");
      expect(res.headers.get("cache-control")).toBe(cache);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect(res.headers.get("content-type")).toBe(name === "r2" ? "image/png" : "application/octet-stream");
      if (range) expect(res.headers.get("content-range")).toBe("bytes 2-3/10");
      if (method === "HEAD") {
        expect(await res.text()).toBe("");
        if (range) expect(mocks.cancel).toHaveBeenCalledOnce();
        else {expect(mocks.head).toHaveBeenCalledOnce(); expect(mocks.get).not.toHaveBeenCalled();}
      } else {
        expect(mocks.get).toHaveBeenCalledOnce(); expect(mocks.head).not.toHaveBeenCalled();
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(range ? [2,3] : [0,1,2,3,4,5,6,7,8,9]));
      }
    });
  }
  it("HEAD invalidates same-size replacement and has no body on errors", async () => {
    expect(route.HEAD).toBeTypeOf("function");
    mocks.head.mockResolvedValueOnce(object('"old"')).mockResolvedValueOnce(object('"new"')).mockResolvedValueOnce(null);
    const a=await route.HEAD(request(name,key,"HEAD"),context(key));
    const b=await route.HEAD(request(name,key,"HEAD"),context(key));
    const missing=await route.HEAD(request(name,key,"HEAD"),context(key));
    expect(a.headers.get("etag")).toBe('"old"'); expect(b.headers.get("etag")).toBe('"new"');
    expect(missing.status).toBe(404); expect(await missing.text()).toBe("");
    expect(missing.headers.get("etag")).toBeNull();
    const invalid=await route.HEAD(request(name,key,"HEAD","not-a-range"),context(key));
    expect(invalid.status).toBe(400); expect(await invalid.text()).toBe("");
  });
});
it("HEAD retains legitimate free-period, active admin and approved production access",async()=>{
  for (const [user,accessLevel,free] of [
    [null,"public",true],
    [{role:"admin",status:"active"},"nda_only",false],
    [{role:"production",status:"active",plan:"team"},"restricted",false],
    [{role:"production",status:"active",plan:"team",ndaAcceptedAt:"2026-09-01"},"nda_only",false],
  ] as const) {
    mocks.user.mockResolvedValue(user); mocks.free.mockReturnValue(free);
    mocks.properties.mockResolvedValue([{splatItems:[{splatUrl:"/api/r2/uploads/scan.rad",accessLevel}]}]);
    const res=await viewer.HEAD(request("viewer-stream","uploads/scan.rad","HEAD"),context("uploads/scan.rad"));
    expect(res.status).toBe(200); expect(res.headers.get("etag")).toBe('"multipart-6"');
    expect(await res.text()).toBe("");
  }
});
it("general R2 GET cache still receives actual body and matching identity",async()=>{
  const cache={match:vi.fn().mockResolvedValue(undefined),put:vi.fn()};
  vi.stubGlobal("caches",{default:cache});
  const res=await r2.GET(request("r2","image.png","GET"),context("image.png"));
  expect(cache.put).toHaveBeenCalledOnce();
  const cached=cache.put.mock.calls[0][1] as Response;
  expect(cached.headers.get("etag")).toBe(res.headers.get("etag"));
  expect(await cached.arrayBuffer()).toEqual(await res.arrayBuffer());
});

it.each(["GET","HEAD"] as const)("%s preserves demo allowlist and general R2 geometry block before metadata access",async method=>{
  for (const [route,name,key] of [[demo,"demo-asset","private.rad"],[r2,"r2","uploads/scan.rad"],[r2,"r2","uploads/private.zip"],[viewer,"viewer-stream","secret.txt"]] as const) {
    expect(route[method]).toBeTypeOf("function");
    const res=await route[method](request(name,key,method),context(key));
    expect(res.status).toBe(name === "demo-asset" ? 404 : 403);
    if (method === "HEAD") expect(await res.text()).toBe("");
  }
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.head).not.toHaveBeenCalled();
});
it.each(["GET","HEAD"] as const)("%s preserves login, plan, restricted and NDA checks",async method=>{
  expect(viewer[method]).toBeTypeOf("function");
  for (const [user,accessLevel,free,status] of [
    [null,"public",false,401], [{role:"individual",plan:"free"},"public",false,403],
    [{role:"individual",plan:"individual"},"restricted",false,403],
    [{role:"individual",plan:"individual"},"nda_only",false,403],
    [null,"restricted",true,403], [null,"nda_only",true,403],
  ] as const) {
    mocks.user.mockResolvedValue(user); mocks.free.mockReturnValue(free);
    mocks.properties.mockResolvedValue([{splatItems:[{splatUrl:"/api/r2/uploads/scan.rad",accessLevel}]}]);
    const res=await viewer[method](request("viewer-stream","uploads/scan.rad",method),context("uploads/scan.rad"));
    expect(res.status).toBe(status); expect(res.headers.get("etag")).toBeNull();
    if (method === "HEAD") expect(await res.text()).toBe("");
  }
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.head).not.toHaveBeenCalled();
});
it("HEAD bypasses stale GET Cache API entries and never writes a bodyless cache entry",async()=>{
  expect(r2.HEAD).toBeTypeOf("function");
  const cache={match:vi.fn().mockResolvedValue(new Response("old",{headers:{ETag:'"stale"'}})),put:vi.fn()};
  vi.stubGlobal("caches",{default:cache});
  const res=await r2.HEAD(request("r2","image.png","HEAD"),context("image.png"));
  expect(res.headers.get("etag")).toBe('"multipart-6"');
  expect(cache.match).not.toHaveBeenCalled(); expect(cache.put).not.toHaveBeenCalled();
});
