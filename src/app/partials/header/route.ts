import { headers } from "next/headers";
import {
  buildPartial,
  collectClasses,
  extractHeader,
  extractInlineStyles,
  extractStylesheetHrefs,
  sanitizeAltLangUrl,
  transformCss,
  transformHeaderHtml,
} from "@/lib/header-partial";

/**
 * GET /partials/header      （EN は /en/partials/header）
 *
 * works（web.locahun3d.com/works/**・静的HTML）へ埋め込むための、
 * 自己完結したヘッダー部品を返す。中身は Declarative Shadow DOM 1ブロック:
 *
 *   <div id="lh-online-header"><template shadowrootmode="open">
 *     <style>…このヘッダーに効く分だけのビルド済みCSS…</style>
 *     …/partials/header-frame が実際に描画した <header> そのもの…
 *   </template></div>
 *   <script>…ハンバーガー等の最小シム…</script>
 *
 * Shadow DOM に閉じてあるので works ページ側のCSSと相互汚染しない。
 *
 * クエリ: `?alt=<URL>` … 言語トグルの行き先（works 側の対応ページ）。
 *         web.locahun3d.com 配下のみ受け付ける。
 *
 * ⚠ 認証状態は載せない（Cookie を転送しない）。常に未ログイン形で返し、
 *   その代わりレスポンスをキャッシュ可能にする。works 側で「ログイン中の顔」を
 *   出したくなったら、この HTML の上に後付けするのが筋。
 */
export const dynamic = "force-dynamic";

type Cached = { at: number; body: string };
const MEMO = new Map<string, Cached>();
const MEMO_TTL_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  // ⚠ 本番の自己フェッチは自ゾーンのホスト名だと Cloudflare に遮断され 522 になる
  //   （Worker が自分の zone へ fetch → 自分自身に届かない。2026-08-30 本番実測）。
  //   dev(:3001) では現れないので必ず本番で確認すること。回避は workers.dev ホスト
  //   経由（別ゾーン扱いで許可される）。環境変数で差し替え可能にしておく。
  // ⚠ Worker は「自分自身」への HTTP fetch を全経路で遮断される（自ゾーンの
  //   ホスト名も自分の workers.dev も本番実測で 522）。dev では現れないので
  //   必ず本番で確認すること。正攻法は自己参照 service binding（wrangler.jsonc の
  //   SELF）。dev では binding が無いため通常の fetch に落とす。
  const selfFetch: typeof fetch = await (async () => {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = await getCloudflareContext();
      const self = (env as { SELF?: { fetch: typeof fetch } }).SELF;
      if (self) return self.fetch.bind(self);
    } catch {}
    return fetch;
  })();
  const internalOrigin = process.env.PARTIALS_INTERNAL_ORIGIN || origin;
  const locale = (await headers()).get("x-locale") === "en" ? "en" : "ja";
  const alt = sanitizeAltLangUrl(url.searchParams.get("alt"));

  // dev では毎回組み立て直す（ヘッダーを直した直後に古い部品が返ると
  // 「直っていない」と誤診する。実際に踏んだ）。
  const key = `${locale}|${alt ?? ""}`;
  const hit = process.env.NODE_ENV === "production" ? MEMO.get(key) : undefined;
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return respond(hit.body);

  try {
    const frameUrl = `${internalOrigin}${locale === "en" ? "/en" : ""}/partials/header-frame`;
    // ⚠ Cookie は渡さない（未ログイン形で固定＝キャッシュ可能にするため）。
    const res = await selfFetch(frameUrl, {
      headers: { "user-agent": "locahun3d-header-partial" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`header-frame ${res.status}`);
    const page = await res.text();

    const header = extractHeader(page);
    if (!header) throw new Error("header element not found");

    const cssParts: string[] = [...extractInlineStyles(page)];
    for (const href of extractStylesheetHrefs(page)) {
      const cssRes = await selfFetch(new URL(href, internalOrigin).toString(), { cache: "no-store" });
      if (cssRes.ok) cssParts.push(await cssRes.text());
    }
    if (!cssParts.length) throw new Error("no stylesheet found");

    const html = transformHeaderHtml(header, alt);
    const css = transformCss(cssParts.join("\n"), collectClasses(html));
    const body = buildPartial(html, css);

    MEMO.set(key, { at: Date.now(), body });
    return respond(body);
  } catch (err) {
    // 取得側（works の Worker）は失敗時に静的ヘッダーへフォールバックする。
    // 壊れた部品を返すくらいなら 503 を返してフォールバックさせる方が安全。
    return new Response(`header partial unavailable v3: ${(err as Error).message}`, {
      status: 503,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }
}

function respond(body: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-robots-tag": "noindex",
      // works（別オリジン）のブラウザから直接読むことは無いが、
      // 検証スクリプトから叩けるように開けておく。
      "access-control-allow-origin": "*",
    },
  });
}
