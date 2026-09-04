/**
 * Proxy (Next.js 16's renamed middleware) composed with Clerk.
 * Protects authenticated routes optimistically; role checks (admin) are
 * enforced again in the DAL/layouts. Clerk validates the session token at the
 * edge against its JWKS — no DB call here.
 */
import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

// 保護対象は locale を剥がした素のパスで判定する（/en/admin も守る）。
// ⚠ /works/** は入れない（実績＆技術ブログは公開ページ。記事単位の非公開は
//    KV ゲーティング側で行う → src/lib/works-gating.ts）。
const PROTECTED = /^\/(account|dashboard|admin|onboarding)(?:\/|$)/;

/* ══════════════════════════════════════════════════════════════════════
 * ホスト振り分け（2026-09-03 works 統合）
 *
 * works（実績＆技術ブログ）は URL を1文字も変えられない（本人指示 2026-08-16。
 * X で共有済みのリンクを全部生かすため）。そこで **web.locahun3d.com の
 * カスタムドメインをこの Worker へ付け替え**、旧マーケサイト Worker
 * (`locahun3dwebsite`) を退役させる。
 *
 *   web.locahun3d.com  … /works/** ・ /en/works/** ・ /assets/** だけを配る。
 *                        それ以外は locahun3d.com へ 301（旧 worker.js の
 *                        RETIRE 表をそのまま移植）。
 *   locahun3d.com      … /works/** ・ /en/works/** は web.locahun3d.com へ 301。
 *                        正典URLを1つに保つ（重複コンテンツを作らない）。
 *   その他(workers.dev / localhost) … 素通し（検証用）。
 * ══════════════════════════════════════════════════════════════════════ */
const WORKS_HOST = "web.locahun3d.com";
const ONLINE_HOST = "locahun3d.com";
const ONLINE_ORIGIN = `https://${ONLINE_HOST}`;
const WORKS_ORIGIN = `https://${WORKS_HOST}`;

/** 旧マーケサイトのページ → オンライン版の着地先（digiroke3d_Web/worker.js より移植）。 */
const RETIRE: Record<string, string> = {
  "/": "/",
  "/index.html": "/",
  "/locahun3d_manifesto.html": "/",
  "/locahun3d_demo.html": "/pricing", // 料金・デモ統合先（#estimate にシミュレーター）
  "/locahun3d_contact.html": "/contact",
  "/locahun3d_data.html": "/#service", // データ活用 → トップのサービス紹介
  "/locahun3d_pitch_hub.html": "/",
  "/locahun3d_privacy.html": "/privacy",
  "/locahun3d_online.html": "/",
  "/en": "/en",
  "/en/": "/en",
  "/en/index.html": "/en",
  "/en/locahun3d_manifesto.html": "/en",
  "/en/locahun3d_demo.html": "/en/pricing",
  "/en/locahun3d_contact.html": "/en/contact",
  "/en/locahun3d_data.html": "/en#service",
  "/en/locahun3d_pitch_hub.html": "/en",
  "/en/locahun3d_privacy.html": "/en/privacy",
  "/en/locahun3d_online.html": "/en",
};

/** 旧マーケサイト Worker だけが持っていた API。退役を明示する。 */
const GONE = /^\/api\/(contact|works)(?:\/|$)/;

/** works として web.locahun3d.com で配り続けるパス。 */
const WORKS_PATH = /^\/(?:en\/)?works(?:\/|$)/;

/** web.locahun3d.com でも素通しが要るパス（Next のランタイム資産・Clerk・クローラ向け）。 */
const PASSTHROUGH = /^\/(?:_next|__clerk)(?:\/|$)|^\/(?:robots\.txt|sitemap\.xml)$/;

function hostOf(req: NextRequest): string {
  return (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
}

/**
 * ホストに応じた 301/410 を返す。素通しでよければ null。
 * Clerk より前に評価する（認証を通す必要がないリダイレクトのため）。
 */
function hostRouting(req: NextRequest): NextResponse | null {
  const host = hostOf(req);
  const { pathname, search } = req.nextUrl;

  if (host === WORKS_HOST) {
    if (WORKS_PATH.test(pathname) || pathname.startsWith("/assets/") || PASSTHROUGH.test(pathname)) {
      return null;
    }
    if (GONE.test(pathname)) {
      return new NextResponse("Gone", {
        status: 410,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    const mapped = Object.prototype.hasOwnProperty.call(RETIRE, pathname)
      ? RETIRE[pathname]
      : "/";
    return NextResponse.redirect(new URL(mapped, ONLINE_ORIGIN), 301);
  }

  if (host === ONLINE_HOST || host === `www.${ONLINE_HOST}`) {
    if (WORKS_PATH.test(pathname)) {
      return NextResponse.redirect(new URL(pathname + search, WORKS_ORIGIN), 301);
    }
  }

  return null;
}

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
    if (basePath.startsWith("/embed/")) requestHeaders.set("x-embed", "1");
    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
  }

  /* 埋め込みページ(/embed/*)であることを RSC へ渡す。App Router の layout は
   * 自分の pathname を知る手段が無いため、ルート layout でサイトのヘッダー/
   * フッターを外す判定に使う（iframe 内で当社のナビが二重に出ると掲載者の
   * サイトデザインを壊す。DECISION_LOG D-008）。
   *
   * パス文字列そのものではなく固定値 "1" を送るのは意図的:
   * ヘッダー値に非ASCII（日本語スラッグ等）が入ると Node が
   * "Invalid header found" で落ちるため、値を持たせない。
   * 埋め込み以外のリクエストでは何も返さず Clerk の応答をそのまま通す
   * （NextResponse.next() を毎回返すと Clerk の認証ヘッダー装飾を壊しうる）。 */
  if (basePath.startsWith("/embed/")) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-embed", "1");
    return NextResponse.next({ request: { headers: requestHeaders } });
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
 *   they had no cookie at all.  We ALSO expire the offending Clerk cookies
 *   so the browser stops resending them — otherwise a returning visitor
 *   keeps hitting the same broken-cookie path on every request. Server-side
 *   degradation alone is not enough: Clerk's own client-side JS
 *   (clerk.browser.js) reads these cookies directly and can itself hang
 *   mid-init on a stale/duplicate one, leaving the sign-in widget blank and
 *   forcing an unexplained redirect away from /sign-in — independent of
 *   whatever the server returned. Clearing lets the browser self-heal.
 *
 *   Clerk suffixes its cookie names per-instance (e.g. `__session_MgkJwgE_`
 *   alongside plain `__session`) — this shows up in the wild whenever a
 *   browser has cookies from more than one Clerk instance (dev vs. prod,
 *   or after a Clerk instance was recreated). A fixed name list would miss
 *   the suffixed variants, so we scan the request's actual cookie jar and
 *   clear anything matching a known Clerk prefix instead of a fixed list.
 * - Protected route → rethrow so the request is not silently admitted;
 *   in practice Clerk's handshake mechanism handles expired-but-validly-
 *   formed tokens before this fallback is reached.
 */
// Clerk cookie name prefixes (prod + suffixed instance variants, e.g.
// `__session_MgkJwgE_`). Any cookie starting with one of these is cleared
// on a broken-token error so it can't wedge the client-side sign-in flow.
const CLERK_COOKIE_PREFIXES = ["__session", "__client", "clerk_active_context"];
export default async function middleware(
  req: NextRequest,
  event: Parameters<typeof clerkHandler>[1],
) {
  // ホスト振り分けは Clerk より前。web.locahun3d.com の退役ページや
  // 正典URL統一の 301 は認証と無関係で、Clerk を通す必要がない。
  const routed = hostRouting(req);
  if (routed) return routed;

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

    // Self-heal: expire every Clerk cookie actually present on the request
    // (matched by prefix, so suffixed instance variants are caught too), so
    // the browser drops them and stops resending stale/duplicate state.
    const clerkCookieNames = req.cookies
      .getAll()
      .map((c) => c.name)
      .filter((name) =>
        CLERK_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix)),
      );
    for (const name of clerkCookieNames) {
      // Clear both the host-only and the apex-domain (.locahun3d.com)
      // variants — Clerk's production instance sets cookies on the apex so
      // they are shared with sub-domains, and we can't know which form the
      // browser holds. Two Set-Cookie headers cover both.
      res.headers.append(
        "set-cookie",
        `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`,
      );
      res.headers.append(
        "set-cookie",
        `${name}=; Path=/; Max-Age=0; Domain=.locahun3d.com; Secure; SameSite=Lax`,
      );
    }

    return res;
  }
}

export const config = {
  matcher: [
    // Skip Next internals and static files unless found in search params
    // ⚠ 拡張子の除外リストから **html を外してある**（2026-09-03 works 統合）。
    //    works の正典URLは /works/<slug>.html・/en/works/<slug>.html で、
    //    ・/en/** → 素パスへの rewrite（x-locale=en）
    //    ・web.locahun3d.com / locahun3d.com のホスト振り分け 301
    //    のどちらも middleware でしか行えない。html を除外したままだと
    //    EN 記事が日本語で出て、旧マーケサイトのページも 301 されない。
    // ⚠ 2026-09-04: 拡張子による除外そのものをやめた。除外パスで **存在しない**
    //    ファイル（/favicon.ico・/foo.svg 等）を要求されると、404 ページのルート
    //    layout が SiteHeader → Clerk の auth() を呼び「clerkMiddleware() を検出
    //    できない」で **500** になっていた（本番実測。ブラウザは /favicon.ico を
    //    毎ページ自動要求する）。middleware を全パスで動かせば 404 が正しく返る。
    //    コストは public/ の実ファイルや R2 配信ルートにも Clerk の軽い検証が
    //    走る程度（DB は叩かない）。_next の内部資産だけは除外。
    "/((?!_next/static|_next/image).*)",
    // Always run for API/clerk routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
