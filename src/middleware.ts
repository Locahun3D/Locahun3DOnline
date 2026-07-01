/**
 * Proxy (Next.js 16's renamed middleware) composed with Clerk.
 * Protects authenticated routes optimistically; role checks (admin) are
 * enforced again in the DAL/layouts. Clerk validates the session token at the
 * edge against its JWKS — no DB call here.
 */
import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

// 保護対象は locale を剥がした素のパスで判定する（/en/admin も守る）。
const PROTECTED = /^\/(account|dashboard|admin|onboarding)(?:\/|$)/;

const clerkHandler = clerkMiddleware(async (auth, req) => {
  const url = req.nextUrl;
  const isEn = url.pathname === "/en" || url.pathname.startsWith("/en/");
  const basePath = isEn ? url.pathname.replace(/^\/en/, "") || "/" : url.pathname;

  if (PROTECTED.test(basePath)) {
    await auth.protect();
  }

  // /en は素のルートへ rewrite し、x-locale=en を上流(RSC)へ渡す。
  if (isEn) {
    const rewriteUrl = url.clone();
    rewriteUrl.pathname = basePath;
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-locale", "en");
    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
  }
});

/**
 * Guard against malformed / garbage Clerk session cookies on PUBLIC routes.
 *
 * Clerk's `authenticateRequest()` can throw a raw SyntaxError (via
 * `JSON.parse` inside `decodeJwt`) when the `__session` cookie value is
 * not a valid base64url-encoded JWT — for example when a browser sends a
 * stale or corrupted token.  Because the middleware throws before it can
 * decorate the response with `x-clerk-auth-status`, RSC's `auth()` helper
 * never sees the Clerk header and throws its own "middleware not running"
 * error, which surfaces as HTTP 500.
 *
 * Fix: catch any unhandled error from `clerkHandler`.
 * - Public route → return NextResponse.next() pre-seeded with
 *   `x-clerk-auth-status: signed-out` so RSC sees a valid (signed-out)
 *   auth state.  The user is treated as unauthenticated, exactly as if
 *   they had no cookie at all.
 * - Protected route → rethrow so the request is not silently admitted;
 *   in practice Clerk's handshake mechanism handles expired-but-validly-
 *   formed tokens before this fallback is reached.
 */
export default async function middleware(
  req: NextRequest,
  event: Parameters<typeof clerkHandler>[1],
) {
  try {
    return await clerkHandler(req, event);
  } catch (err) {
    const url = req.nextUrl;
    const isEn = url.pathname === "/en" || url.pathname.startsWith("/en/");
    const basePath = isEn
      ? url.pathname.replace(/^\/en/, "") || "/"
      : url.pathname;

    // Rethrow on protected routes — we must never silently admit a broken
    // token to an authenticated area.
    if (PROTECTED.test(basePath)) throw err;

    // Public route: degrade to "signed-out".
    // Inject `x-clerk-auth-status: signed-out` via the Next.js
    // x-middleware-override-headers mechanism so that RSC's auth() call
    // reads a valid (signed-out) state instead of throwing.
    const res = NextResponse.next();
    const OVERRIDE = "x-middleware-override-headers";
    const PREFIX = "x-middleware-request";
    const STATUS_HEADER = "x-clerk-auth-status";

    // Copy existing request headers into the override set (required by Next.js).
    const existingKeys = [...req.headers.keys()];
    res.headers.set(OVERRIDE, [...existingKeys, STATUS_HEADER].join(","));
    req.headers.forEach((val, key) => {
      res.headers.set(`${PREFIX}-${key}`, val);
    });
    res.headers.set(`${PREFIX}-${STATUS_HEADER}`, "signed-out");

    return res;
  }
}

export const config = {
  matcher: [
    // Skip Next internals and static files unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API/clerk routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
