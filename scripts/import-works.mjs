/**
 * import-works.mjs — マーケサイト(digiroke3d_Web)の静的 works HTML を
 * オンライン版が配れる JSON へ取り込む。
 *
 *   node scripts/import-works.mjs
 *
 * 入力 : ../digiroke3d_Web/works/*.html   （admin.html は除く）
 *        ../digiroke3d_Web/en/works/*.html
 * 出力 : content/works/{ja,en}/<slug>.json
 *        content/works/manifest.json
 *        src/content/works.generated.ts   （Worker へバンドルするための静的 import 束）
 *
 * ⚠ URL は1文字も変えない（本人指示 2026-08-16 / X で共有済み）。
 *   slug = ファイル名から .html を除いたもの。配信 URL は
 *   /works/<slug>.html ・ /en/works/<slug>.html のまま。
 *
 * 何を捨てるか:
 *   - 静的ヘッダー <header class="site-header …> …（本物の SiteHeader を使う）
 *   - 静的フッター <footer class="site-foot"> …（本物の SiteFooter を使う）
 *   - /assets/works-header.css・/assets/site-header.css の link
 *   - @font-face / @import（フォントは works layout が Google Fonts で読む）
 *   - body の padding-top（旧ヘッダーは fixed。本物は sticky なので予約は不要）
 * 何を残すか:
 *   - ページ内 <style> 全部（`.works-root` にスコープして他ページへ漏らさない）
 *   - 本文内の <script>（ライトボックス・カード生成・BudouX 等）
 *
 * 冪等。記事の生成は今までどおり digiroke3d_Web 側で行い、
 * そのあと本スクリプトを回して commit する。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC_ROOT = resolve(ROOT, "../digiroke3d_Web");
const SRC = { ja: join(SRC_ROOT, "works"), en: join(SRC_ROOT, "en/works") };
const OUT = join(ROOT, "content/works");
const GENERATED = join(ROOT, "src/content/works.generated.ts");

/** 取り込まない（オンライン版には /admin/works がある）。 */
const SKIP = new Set(["admin.html"]);

// ── 小道具 ────────────────────────────────────────────────────────────
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i")) ||
    tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i"));
  return m ? m[1] : null;
};

function metaMap(head) {
  const out = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = attr(tag, "property") || attr(tag, "name") || attr(tag, "http-equiv");
    const val = attr(tag, "content");
    if (key && val != null && !(key in out)) out[key] = val;
  }
  return out;
}

// ── CSS を .works-root へスコープする ─────────────────────────────────
const SCOPE = ".works-root";

/**
 * 1本のセレクタを .works-root 配下へ閉じ込める。
 *  *          → .works-root, .works-root *
 *  html/body/:root → .works-root
 *  それ以外   → .works-root <selector>
 */
function scopeSelector(sel) {
  const out = [];
  for (let one of sel.split(",")) {
    one = one.trim();
    if (!one) continue;
    if (one === "*") {
      out.push(SCOPE, `${SCOPE} *`);
      continue;
    }
    if (/^(?:html|body|:root)$/i.test(one)) {
      out.push(SCOPE);
      continue;
    }
    // 先頭の html / body / :root は .works-root に読み替える
    // （`body::before` → `.works-root::before`、`body .x` → `.works-root .x`）。
    const lead = one.match(/^(?:html|body|:root)\b/i);
    if (lead) {
      const rest = one.slice(lead[0].length);
      out.push(rest.trim() ? `${SCOPE}${rest}` : SCOPE);
      continue;
    }
    out.push(`${SCOPE} ${one}`);
  }
  // html,body{…} のように同じ結果へ潰れる並びを重複させない
  return [...new Set(out)].join(",");
}

/** body/html/:root 由来の宣言から padding-top を落とす（旧 fixed ヘッダーの予約）。 */
function dropHeaderReservation(decls) {
  return decls
    .split(";")
    .filter((d) => !/^\s*padding-top\s*:/i.test(d))
    .join(";");
}

/** 波括弧のバランスを取りながらブロック本体を切り出す。 */
function readBlock(css, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < css.length; i++) {
    const c = css[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { body: css.slice(openIndex + 1, i), end: i + 1 };
    }
  }
  return { body: css.slice(openIndex + 1), end: css.length };
}

const NESTED_AT = /^@(media|supports|container|layer|scope)\b/i;
const VERBATIM_AT = /^@(keyframes|-webkit-keyframes|-moz-keyframes|page|counter-style|property|font-feature-values)\b/i;
const DROP_AT = /^@(font-face|import|charset|namespace)\b/i;

function scopeCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let i = 0;
  while (i < css.length) {
    // 次の `{` か `;` まで読む＝プレリュード
    let j = i;
    while (j < css.length && css[j] !== "{" && css[j] !== ";") j++;
    const prelude = css.slice(i, j).trim();
    if (j >= css.length) {
      break; // 末尾のゴミ
    }
    if (css[j] === ";") {
      // ブロックを持たない at-rule（@import 等）。落とすものは落とす。
      if (prelude && !DROP_AT.test(prelude)) out.push(`${prelude};`);
      i = j + 1;
      continue;
    }
    const { body, end } = readBlock(css, j);
    i = end;
    if (!prelude) continue;
    if (DROP_AT.test(prelude)) continue;
    if (NESTED_AT.test(prelude)) {
      out.push(`${prelude}{${scopeCss(body)}}`);
      continue;
    }
    if (VERBATIM_AT.test(prelude)) {
      out.push(`${prelude}{${body}}`);
      continue;
    }
    if (prelude.startsWith("@")) {
      out.push(`${prelude}{${body}}`);
      continue;
    }
    const isRootish = prelude
      .split(",")
      .every((s) => /^(?:html|body|:root)$/i.test(s.trim()));
    out.push(`${scopeSelector(prelude)}{${isRootish ? dropHeaderReservation(body) : body}}`);
  }
  return out.join("\n");
}

// ── 相対メディアパスの正規化 ─────────────────────────────────────────
/** `images/…` `videos/…` → `/works/…`。引用符・url() の直後だけを対象にする。 */
function normalizeMedia(html) {
  return html.replace(/(["'(])(?:\.\/)?(images|videos)\//g, "$1/works/$2/");
}

// ── HTML 1本を JSON へ ───────────────────────────────────────────────
function convert(file, locale) {
  // ⚠ 改行は必ず LF に正規化する。取り込み元は CRLF で、そのまま JSON へ入れると
  //    SSR した HTML（\r\n）とクライアントへ届く RSC ペイロード（\n）が食い違い、
  //    React が hydration mismatch を投げる（実際に踏んだ）。
  const raw = readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  const bodyOpen = raw.search(/<body\b[^>]*>/i);
  if (bodyOpen < 0) throw new Error(`no <body> in ${file}`);
  const head = raw.slice(0, bodyOpen);
  const bodyTag = raw.slice(bodyOpen).match(/^<body\b[^>]*>/i)[0];
  const bodyEnd = raw.toLowerCase().lastIndexOf("</body>");
  let body = raw.slice(bodyOpen + bodyTag.length, bodyEnd < 0 ? raw.length : bodyEnd);

  // 静的ヘッダー / 静的フッターを落とす
  body = stripBlock(body, /<header\b[^>]*class="[^"]*\bsite-header\b[^"]*"[^>]*>/i, "header");
  body = stripBlock(body, /<footer\b[^>]*class="[^"]*\bsite-foot\b[^"]*"[^>]*>/i, "footer");
  body = normalizeMedia(body).trim();

  const styles = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const css = scopeCss(normalizeMedia(styles.join("\n")));

  const meta = metaMap(head);
  const titleM = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonicalM = head.match(/<link\b[^>]*rel="canonical"[^>]*>/i);
  const fontsM = head.match(/<link\b[^>]*href="(https:\/\/fonts\.googleapis\.com\/css2[^"]*)"[^>]*>/i);

  // meta refresh（blog.html 等の統合先への転送ページ）はサーバー側リダイレクトにする。
  let redirectTo = null;
  const refresh = meta["refresh"];
  if (refresh) {
    const m = refresh.match(/url\s*=\s*(.+)$/i);
    if (m) redirectTo = absolutize(m[1].trim(), locale);
  }

  return {
    locale,
    title: titleM ? decodeEntitiesLight(titleM[1].trim()) : "",
    description: meta["description"] ?? null,
    canonical: canonicalM ? attr(canonicalM[0], "href") : null,
    fontsHref: fontsM ? fontsM[1] : null,
    redirectTo,
    og: {
      type: meta["og:type"] ?? null,
      title: meta["og:title"] ?? null,
      description: meta["og:description"] ?? null,
      url: meta["og:url"] ?? null,
      image: meta["og:image"] ?? null,
      siteName: meta["og:site_name"] ?? null,
    },
    twitter: {
      card: meta["twitter:card"] ?? null,
      title: meta["twitter:title"] ?? null,
      description: meta["twitter:description"] ?? null,
      image: meta["twitter:image"] ?? null,
    },
    css,
    bodyHtml: body,
  };
}

/** `<tag …>` から対応する閉じタグまでを丸ごと落とす（入れ子は想定しない）。 */
function stripBlock(html, openRe, tagName) {
  const m = html.match(openRe);
  if (!m) return html;
  const start = m.index;
  const closeIdx = html.toLowerCase().indexOf(`</${tagName}>`, start);
  if (closeIdx < 0) return html;
  return html.slice(0, start) + html.slice(closeIdx + tagName.length + 3);
}

function absolutize(url, locale) {
  if (/^https?:\/\//i.test(url) || url.startsWith("/")) return url;
  return `${locale === "en" ? "/en" : ""}/works/${url.replace(/^\.\//, "")}`;
}

function decodeEntitiesLight(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ── 実行 ─────────────────────────────────────────────────────────────
if (!existsSync(SRC.ja)) {
  console.error(`✘ 取込元が見つからない: ${SRC.ja}\n  digiroke3d_Web を locahun3d_online と同じ親ディレクトリに置くこと。`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });

const manifest = { generatedAt: new Date().toISOString(), pages: {} };
const generatedImports = [];
const generatedEntries = { ja: [], en: [] };

for (const locale of ["ja", "en"]) {
  const dir = SRC[locale];
  if (!existsSync(dir)) continue;
  mkdirSync(join(OUT, locale), { recursive: true });
  const files = readdirSync(dir).filter((f) => f.endsWith(".html") && !SKIP.has(f)).sort();
  for (const f of files) {
    const slug = f.replace(/\.html$/, "");
    const page = convert(join(dir, f), locale);
    writeFileSync(join(OUT, locale, `${slug}.json`), JSON.stringify(page, null, 1) + "\n", "utf8");
    (manifest.pages[slug] ??= { locales: [] }).locales.push(locale);
    if (locale === "ja") manifest.pages[slug].title = page.title;
    const ident = `p_${locale}_${slug.replace(/[^a-z0-9]/gi, "_")}`;
    generatedImports.push(`import ${ident} from "../../content/works/${locale}/${slug}.json";`);
    generatedEntries[locale].push(`  ${JSON.stringify(slug)}: ${ident} as WorksPage,`);
    console.log(`  ${locale}/${slug}  css ${page.css.length}B  body ${page.bodyHtml.length}B${page.redirectTo ? `  → ${page.redirectTo}` : ""}`);
  }
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n", "utf8");

mkdirSync(dirname(GENERATED), { recursive: true });
writeFileSync(
  GENERATED,
  `// ⚠ 自動生成 — 直接編集しない。\n` +
    `// 生成: node scripts/import-works.mjs（取込元 digiroke3d_Web/works・digiroke3d_Web/en/works）\n` +
    `// Cloudflare Workers にはファイルシステムが無いため、記事 JSON は静的 import で\n` +
    `// バンドルに焼き込む。ここは束ねるだけのモジュール。\n` +
    `import type { WorksPage } from "@/lib/works-content";\n` +
    generatedImports.join("\n") +
    `\n\nexport const WORKS_PAGES: Record<"ja" | "en", Record<string, WorksPage>> = {\n` +
    ` ja: {\n${generatedEntries.ja.join("\n")}\n },\n` +
    ` en: {\n${generatedEntries.en.join("\n")}\n },\n};\n`,
  "utf8",
);

console.log(`\n✔ ${Object.keys(manifest.pages).length} slug を取り込んだ → content/works/ + src/content/works.generated.ts`);
