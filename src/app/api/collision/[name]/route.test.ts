import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const store = new Map<string, { bytes: Uint8Array; meta: Record<string, string> }>();
const calls: string[] = [];
const object = (key: string) => {
  const hit = store.get(key);
  if (!hit) return null;
  return {
    size: hit.bytes.byteLength, httpEtag: '"etag"', customMetadata: hit.meta,
    arrayBuffer: async () => hit.bytes.slice().buffer, body: { cancel: async () => {} },
  };
};
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { R2_ASSETS: {
    get: async (k: string) => { calls.push("get " + k); return object(k); },
    head: async (k: string) => { calls.push("head " + k); return object(k); },
  } } }),
}));
import { GET, HEAD } from "./route";

const KEY = "a".repeat(64), SHA = "b".repeat(64);
const req = (name: string) => new NextRequest("https://locahun3d.com/api/collision/" + name);
const ctx = (name: string) => ({ params: Promise.resolve({ name }) });

beforeEach(() => { store.clear(); calls.length = 0; });

it("serves a prebaked file with length, digest and immutable caching", async () => {
  store.set(`collision/${KEY}.lct`, { bytes: new Uint8Array([1, 2, 3]), meta: { sha256: SHA } });
  const res = await GET(req(`${KEY}.lct`), ctx(`${KEY}.lct`));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-length")).toBe("3");
  expect(res.headers.get("x-l3d-sha256")).toBe(SHA);
  expect(res.headers.get("cache-control")).toContain("immutable");
  expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
  const head = await HEAD(req(`${KEY}.lct`), ctx(`${KEY}.lct`));
  expect(head.status).toBe(200);
  expect(head.headers.get("x-l3d-sha256")).toBe(SHA);
});

it("404s (uncached) for a missing key, bad names and objects without a digest", async () => {
  const missing = await GET(req(`${KEY}.lct`), ctx(`${KEY}.lct`));
  expect(missing.status).toBe(404);
  expect(missing.headers.get("cache-control")).toBe("no-store");
  for (const name of ["../x.lct", `${KEY}.zip`, `${KEY.toUpperCase()}.lct`, "assets%2Fsplat%2Fx.lct"]) {
    expect((await GET(req(name), ctx(name))).status).toBe(404);
  }
  // Only the collision/ prefix is ever read; malformed names never reach R2.
  expect(calls).toEqual([`get collision/${KEY}.lct`]);
  store.set(`collision/${KEY}.lct`, { bytes: new Uint8Array([1]), meta: {} });
  expect((await GET(req(`${KEY}.lct`), ctx(`${KEY}.lct`))).status).toBe(404);
});
