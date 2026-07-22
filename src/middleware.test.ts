/**
 * Unit tests for the middleware's stale-cookie graceful-degradation path.
 *
 * We don't spin up a real Next.js server here; instead we exercise the
 * exported `middleware` function directly, stubbing out `clerkMiddleware`
 * so we can simulate the SyntaxError that Clerk throws when it encounters
 * a malformed __session cookie (garbage base64 → JSON.parse throws).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(pathname: string, cookies?: Record<string, string>) {
  const url = `https://locahun3d.com${pathname}`;
  const headers = new Headers();
  if (cookies) {
    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    headers.set("cookie", cookieStr);
  }
  return new NextRequest(url, { method: "GET", headers });
}

// ---------------------------------------------------------------------------
// The middleware module is tightly coupled to clerkMiddleware, so we need
// to mock it at the module level.  We re-import the middleware after mocking.
// ---------------------------------------------------------------------------

// Vitest 4 の vi.fn は「引数タプル + 戻り値」ではなく関数型を1つ取る。
const mockClerkHandler =
  vi.fn<(req: NextRequest, ev: unknown) => Promise<NextResponse>>();

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: () => mockClerkHandler,
}));

// Import AFTER mocking so the module picks up our stub.
// Dynamic import ensures each test group can reset the mock.
const { default: middleware } = await import("./middleware");

// middleware の戻り値型は null/undefined(=素通り)を含むが、このファイルの
// テストは全て「レスポンスを返す」ケースなので、ここで潰して以降を非nullで扱う。
async function run(req: NextRequest) {
  const res = await middleware(req, {} as never);
  if (res == null) throw new Error("middleware returned no response");
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("middleware graceful degradation for invalid Clerk session cookies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through normally when clerkHandler succeeds", async () => {
    const expected = NextResponse.next();
    mockClerkHandler.mockResolvedValue(expected);

    const req = makeRequest("/");
    const res = await run(req);

    expect(res).toBe(expected);
    expect(mockClerkHandler).toHaveBeenCalledOnce();
  });

  it("returns signed-out NextResponse.next() when clerkHandler throws on a PUBLIC route", async () => {
    mockClerkHandler.mockRejectedValue(
      new SyntaxError("Unexpected token — simulates malformed JWT parse failure"),
    );

    const req = makeRequest("/", {
      __session: "garbage.invalid.token",
      __client_uat: "1",
    });
    const res = await run(req);

    // Must be a 200 (next), not 500.
    expect(res.status).toBe(200);

    // The x-middleware-override-headers mechanism must be set so RSC's
    // auth() sees x-clerk-auth-status: signed-out.
    const override = res.headers.get("x-middleware-override-headers") ?? "";
    expect(override).toContain("x-clerk-auth-status");

    const statusHeader = res.headers.get(
      "x-middleware-request-x-clerk-auth-status",
    );
    expect(statusHeader).toBe("signed-out");
  });

  it("returns signed-out on PUBLIC routes for other public paths", async () => {
    mockClerkHandler.mockRejectedValue(new SyntaxError("malformed token"));

    for (const path of [
      "/properties",
      "/properties/some-id",
      "/pricing",
      "/about",
      "/terms/privacy",
    ]) {
      const req = makeRequest(path, { __session: "garbage.bad.token" });
      const res = await run(req);
      expect(res.status, `path ${path} should return 200`).toBe(200);
      expect(
        res.headers.get("x-middleware-request-x-clerk-auth-status"),
        `path ${path} should set signed-out`,
      ).toBe("signed-out");
    }
  });

  it("rethrows when clerkHandler throws on a PROTECTED route", async () => {
    const error = new SyntaxError("malformed token");
    mockClerkHandler.mockRejectedValue(error);

    for (const path of [
      "/account",
      "/dashboard",
      "/admin",
      "/admin/properties",
      "/onboarding",
    ]) {
      const req = makeRequest(path, { __session: "garbage.bad.token" });
      await expect(
        middleware(req, {} as never),
        `path ${path} should rethrow`,
      ).rejects.toThrow(error);
    }
  });

  it("rethrows even for /en-prefixed protected routes", async () => {
    const error = new SyntaxError("malformed token");
    mockClerkHandler.mockRejectedValue(error);

    const req = makeRequest("/en/admin", { __session: "garbage.bad.token" });
    await expect(middleware(req, {} as never)).rejects.toThrow(error);
  });

  it("returns signed-out for /en-prefixed public routes", async () => {
    mockClerkHandler.mockRejectedValue(new SyntaxError("malformed token"));

    const req = makeRequest("/en/properties", {
      __session: "garbage.bad.token",
    });
    const res = await run(req);
    expect(res.status).toBe(200);
    expect(
      res.headers.get("x-middleware-request-x-clerk-auth-status"),
    ).toBe("signed-out");
  });

  it("expires the broken Clerk cookies on a PUBLIC route so the browser self-heals", async () => {
    mockClerkHandler.mockRejectedValue(new SyntaxError("malformed token"));

    const req = makeRequest("/", {
      __session: "garbage.bad.token",
      __client_uat: "1",
    });
    const res = await run(req);

    const setCookies = res.headers.getSetCookie();
    const joined = setCookies.join("\n");
    // Only cookies actually present on the request are cleared (Max-Age=0),
    // in both host-only and apex-domain forms.
    for (const name of ["__session", "__client_uat"]) {
      expect(joined, `${name} host-only cleared`).toContain(
        `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`,
      );
      expect(joined, `${name} apex-domain cleared`).toContain(
        `${name}=; Path=/; Max-Age=0; Domain=.locahun3d.com; Secure; SameSite=Lax`,
      );
    }
  });

  it("expires suffixed instance-variant cookies too (e.g. __session_MgkJwgE_)", async () => {
    // Real-world case: a browser holding cookies from more than one Clerk
    // instance (e.g. after the prod instance was recreated) ends up with
    // both plain __session and a suffixed __session_XXXXX. A fixed-name
    // list would miss the suffixed one and leave the client-side Clerk JS
    // stuck reading stale state.
    mockClerkHandler.mockRejectedValue(new SyntaxError("malformed token"));

    const req = makeRequest("/", {
      __session: "garbage",
      __session_MgkJwgE_: "also-garbage",
      __client_uat: "1",
      __client_uat_MgkJwgE_: "1",
      clerk_active_context: "some-org-id",
    });
    const res = await run(req);

    const joined = res.headers.getSetCookie().join("\n");
    for (const name of [
      "__session",
      "__session_MgkJwgE_",
      "__client_uat",
      "__client_uat_MgkJwgE_",
      "clerk_active_context",
    ]) {
      expect(joined, `${name} cleared`).toContain(`${name}=; Path=/; Max-Age=0;`);
    }
  });

  it("does NOT emit Set-Cookie when no Clerk cookie is present", async () => {
    mockClerkHandler.mockRejectedValue(new SyntaxError("some other error"));

    const req = makeRequest("/"); // no cookies at all
    const res = await run(req);

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
