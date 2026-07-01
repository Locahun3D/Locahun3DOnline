/**
 * Proxy (Next.js 16's renamed middleware) composed with Clerk.
 * Protects authenticated routes optimistically; role checks (admin) are
 * enforced again in the DAL/layouts. Clerk validates the session token at the
 * edge against its JWKS — no DB call here.
 */
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// 保護対象は locale を剥がした素のパスで判定する（/en/admin も守る）。
const PROTECTED = /^\/(account|dashboard|admin|onboarding)(?:\/|$)/;

export default clerkMiddleware(async (auth, req) => {
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

export const config = {
  matcher: [
    // Skip Next internals and static files unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API/clerk routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
