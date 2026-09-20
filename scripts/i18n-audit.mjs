// 英語版（/en/*）の未翻訳チェック（2026-09-20）。
// 公開ルートを 1440 / 390 幅で開き、<details> を全部開いてから、日本語を含む可視テキストと
// placeholder / title / aria-label / alt を集める。物件データ（data/properties.json の値）は
// 「UIではなくデータ」として別枠に分ける。Clerk ウィジェット内部は対象外。
//
//   npx next dev -p 3007   （別ターミナル）
//   node scripts/i18n-audit.mjs [--base http://localhost:3007] [--out artifacts/i18n-audit] [--no-shots] [--props N]
//
// 出力: <out>/report.json, <out>/report.md, <out>/<page>-<幅>.png
// 終了コード: UI の未翻訳が1件でもあれば 1。
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const BASE = arg("--base", "http://localhost:3007").replace(/\/$/, "");
const OUT = arg("--out", "artifacts/i18n-audit");
const SHOTS = !process.argv.includes("--no-shots");
const WIDTHS = [1440, 390];
// 「・」「ー」だけの装飾は日本語テキストとして数えない
// 全角の句読点・括弧・波ダッシュ（、。「」（）〜～）も英語版では漏れとして拾う
const JP = /[ぁ-ゖァ-ヺ一-鿿、。「」（）〜～]/;

// ── 物件データ（日本語で入力されEN値が無いもの）は UI の漏れと区別する ──
const rawData = JSON.parse(fs.readFileSync("data/properties.json", "utf8"));
const properties = Array.isArray(rawData) ? rawData : rawData.properties ?? [];
const dataStrings = new Set();
(function walk(v) {
  if (typeof v === "string") { if (JP.test(v)) dataStrings.add(v.replace(/\s+/g, " ").trim()); }
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object") Object.values(v).forEach(walk);
})(properties);
const dataList = [...dataStrings];
const isData = (s) => dataList.some((d) => d === s || (s.length >= 4 && d.length >= 4 && (d.includes(s) || s.includes(d))));

const firstId = properties.find((p) => p.status === "published")?.id ?? properties[0]?.id;
const termsSubs = fs.existsSync("src/app/terms")
  ? fs.readdirSync("src/app/terms", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/en/terms/${d.name}`)
  : [];
const ROUTES = [
  "/en", "/en/properties", firstId ? `/en/properties/${firstId}` : null, "/en/pricing", "/en/about",
  "/en/contact", "/en/contact/scan", "/en/contact/request", "/en/contact/listing", "/en/contact/license",
  "/en/cart", "/en/privacy", "/en/terms", ...termsSubs,
  "/en/sign-in", "/en/sign-up", "/en/submit-scan", "/en/unsubscribe", "/en/share/x", "/en/this-page-does-not-exist",
].filter(Boolean);

// ── 文字列 → ソースの場所（src/ と content/ 以外は見ない） ──
const srcFiles = [];
(function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.generated|admin/.test(p)) collect(p); }
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p);
  }
})("src");
const srcCache = new Map();
function locate(s) {
  const needles = [s, s.slice(0, 14), s.slice(0, 8)].filter((n, i, a) => n.length >= 2 && a.indexOf(n) === i);
  for (const n of needles) {
    for (const f of srcFiles) {
      if (!srcCache.has(f)) srcCache.set(f, fs.readFileSync(f, "utf8").split(/\r?\n/));
      const i = srcCache.get(f).findIndex((l) => l.includes(n) && !/^\s*(\/\/|\*|\{\/\*)/.test(l));
      if (i >= 0) return `${f.replace(/\\/g, "/")}:${i + 1}`;
    }
  }
  return "(not found in src — data / generated / 3rd party)";
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
// --props N: 一覧ページから物件リンクを N 件拾って追加する（本番など、手元の JSON に無い物件を見る時）
const PROPS = Number(arg("--props", "0"));
if (PROPS > 0) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + "/en/properties", { waitUntil: "networkidle", timeout: 180000 }).catch(() => {});
  const links = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/properties/"]')].map((a) => new URL(a.href).pathname))]);
  await page.close();
  for (const l of links.filter((l) => /^\/en\/properties\/[^/]+$/.test(l)).slice(0, PROPS)) if (!ROUTES.includes(l)) ROUTES.push(l);
}
const pages = {};
for (const route of ROUTES) {
  const found = new Map(); // text → {kinds:Set, widths:Set}
  let status = 0;
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, locale: "en-US" });
    try {
      const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 180000 });
      status = res?.status() ?? 0;
    } catch { /* networkidle に届かなくても、描けた分を調べる */ }
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    await page.waitForTimeout(400);
    const items = await page.evaluate((jpSrc) => {
      const JP = new RegExp(jpSrc);
      const skip = (el) => !!el.closest('[class*="cl-"], script, style, noscript, template, nextjs-portal, [data-nextjs-toast], [data-i18n-audit-ignore]');
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
      };
      const out = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const t = n.textContent.replace(/\s+/g, " ").trim();
        const el = n.parentElement;
        if (!t || !JP.test(t) || !el || skip(el) || !visible(el)) continue;
        // 言語切替の「日本語」は意図した表記
        if (/^(日本語|JP|JA)$/.test(t)) continue;
        out.push({ kind: "text", text: t });
      }
      for (const el of document.querySelectorAll("[placeholder],[title],[aria-label],[alt]")) {
        if (skip(el)) continue;
        for (const a of ["placeholder", "title", "aria-label", "alt"]) {
          const v = (el.getAttribute(a) || "").replace(/\s+/g, " ").trim();
          if (v && JP.test(v) && !/^(日本語)$/.test(v)) out.push({ kind: a, text: v });
        }
      }
      for (const el of document.querySelectorAll("option")) {
        const t = el.textContent.replace(/\s+/g, " ").trim();
        if (t && JP.test(t) && !skip(el)) out.push({ kind: "option", text: t });
      }
      const title = document.title;
      if (JP.test(title)) out.push({ kind: "document.title", text: title });
      const md = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
      if (JP.test(md)) out.push({ kind: "meta description", text: md });
      return out;
    }, JP.source);
    for (const it of items) {
      const e = found.get(it.text) ?? { kinds: new Set(), widths: new Set() };
      e.kinds.add(it.kind); e.widths.add(width); found.set(it.text, e);
    }
    if (SHOTS) {
      const name = (route.replace(/^\/en\/?/, "") || "home").replace(/[^\w-]+/g, "_");
      await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true }).catch(() => {});
    }
    await page.close();
  }
  const ui = [], data = [];
  for (const [text, e] of found) {
    const row = { text, kinds: [...e.kinds], widths: [...e.widths] };
    if (isData(text)) data.push(row);
    else ui.push({ ...row, source: locate(text) });
  }
  pages[route] = { status, ui, data };
  console.log(`${route}  [${status}]  UI ${ui.length}  data ${data.length}`);
}
await browser.close();

const uiTotal = Object.values(pages).reduce((n, p) => n + p.ui.length, 0);
const dataTotal = Object.values(pages).reduce((n, p) => n + p.data.length, 0);
const uiUnique = new Set(Object.values(pages).flatMap((p) => p.ui.map((u) => u.text))).size;
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, uiTotal, uiUnique, dataTotal, pages }, null, 2));
let md = `# i18n audit — ${BASE}\n\nUI strings: **${uiTotal}** (unique ${uiUnique}) / data strings: ${dataTotal}\n`;
for (const [route, p] of Object.entries(pages)) {
  md += `\n## ${route} (HTTP ${p.status}) — UI ${p.ui.length} / data ${p.data.length}\n`;
  for (const u of p.ui) md += `- [${u.kinds.join(",")}] ${u.text.slice(0, 160)} — \`${u.source}\`\n`;
  if (p.data.length) md += `\n_data, not UI:_ ${p.data.map((d) => d.text.slice(0, 40)).join(" ｜ ")}\n`;
}
fs.writeFileSync(path.join(OUT, "report.md"), md);
console.log(`\nUI untranslated: ${uiTotal} (unique ${uiUnique}) / data: ${dataTotal}\n→ ${path.join(OUT, "report.md")}`);
process.exit(uiTotal > 0 ? 1 : 0);
