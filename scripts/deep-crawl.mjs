// deep-crawl.mjs — 公開ページを総当たりで細かく点検する（2026-10-16 本人「もっと長期で細かくデバッグ」）。
//
//   node scripts/deep-crawl.mjs [--base https://locahun3d.com] [--out artifacts/deep-crawl] [--widths 1440,1180,820,390]
//
// ページ（公開物件すべて × 日本語/英語）× 幅ごとに次を集める:
//   - HTTP ステータス、ページ内の JS エラー（pageerror / console.error）、失敗したリクエスト（4xx/5xx・通信失敗）
//   - 表示できていない画像（naturalWidth=0）、横スクロール（本文の幅が画面を超える）、画面外にはみ出した要素
//   - 英語ページに残った日本語（物件データ由来も含めて全部。ページの <script> は除く）
// 最後にページ内リンク（同じサイトの <a href>）を1回ずつ HEAD/GET して、404 などを拾う。
// 出力: <out>/report.json と <out>/report.md
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("--base", "https://locahun3d.com").replace(/\/$/, "");
const OUT = arg("--out", "artifacts/deep-crawl");
const WIDTHS = arg("--widths", "1440,1180,820,390").split(",").map(Number);
const HEIGHT = (w) => (w === 1180 ? 820 : w === 820 ? 1180 : w === 390 ? 844 : 900);
fs.mkdirSync(OUT, { recursive: true });

// 公開物件の一覧はサイトマップから取る（データの読み先に依存しない）
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text().catch(() => "");
const fromMap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  .filter((p) => !/^\/works\//.test(p));
const STATIC = ["/", "/properties", "/data", "/pricing", "/about", "/contact", "/contact/scan", "/contact/request", "/contact/listing",
  "/contact/license", "/cart", "/privacy", "/terms", "/terms/listing", "/terms/service", "/terms/data-download", "/terms/tokushoho",
  "/submit-scan", "/sign-in", "/sign-up", "/unsubscribe", "/this-page-does-not-exist"];
const jaPaths = [...new Set([...STATIC, ...fromMap.filter((p) => !p.startsWith("/en"))])];
const ONLY = arg("--paths", "");
const ROUTES = ONLY ? ONLY.split(",") : [...jaPaths, ...jaPaths.map((p) => (p === "/" ? "/en" : `/en${p}`))];
console.log(`routes ${ROUTES.length} × widths ${WIDTHS.length}`);

const JP = /[ぁ-ゖァ-ヺ一-鿿]/;
const b = await chromium.launch({ channel: "chrome" });
// 途中で止まっても続きから回せるよう、1件ずつ JSONL に追記する（--resume で済んだものを飛ばす）
const JSONL = path.join(OUT, "results.jsonl");
const results = process.argv.includes("--resume") && fs.existsSync(JSONL)
  ? fs.readFileSync(JSONL, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
if (!process.argv.includes("--resume")) fs.writeFileSync(JSONL, "");
const doneKeys = new Set(results.map((r) => `${r.width} ${r.route}`));
const links = new Set();
for (const width of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width, height: HEIGHT(width) } });
  for (const route of ROUTES) {
    if (doneKeys.has(`${width} ${route}`)) continue;
    const p = await ctx.newPage();
    const errors = [], failed = [];
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    p.on("console", (m) => { if (m.type() === "error") errors.push(("console: " + m.text()).slice(0, 200)); });
    p.on("requestfailed", (r) => { const u = r.url(); if (!/google|clerk|stripe|cloudflareinsights|turnstile|challenges/.test(u)) failed.push(`${r.failure()?.errorText} ${u.slice(0, 140)}`); });
    p.on("response", (r) => { const s = r.status(); const u = r.url(); if (s >= 400 && u.startsWith(BASE) && !/__clerk|\/api\/track/.test(u)) failed.push(`${s} ${u.slice(0, 140)}`); });
    let status = 0;
    try {
      const resp = await p.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
      status = resp?.status() ?? 0;
      await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(800);
      const m = await p.evaluate(({ jp, en }) => {
        const JP = new RegExp(jp);
        const vw = document.documentElement.clientWidth;
        const out = { overflowX: document.documentElement.scrollWidth - vw, offscreen: [], brokenImgs: [], jp: [], links: [] };
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // 横スクロールの犯人: 画面の右端を 2px 以上越える葉に近い要素（祖先が overflow で切っていれば除外）
          if (r.right > vw + 2 && el.children.length === 0) {
            let clipped = false;
            for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.overflowX !== "visible") { clipped = true; break; } }
            if (!clipped) out.offscreen.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} right=${Math.round(r.right)} "${(el.textContent || "").trim().slice(0, 30)}"`);
          }
        }
        for (const im of document.images) if (im.complete && im.naturalWidth === 0 && im.currentSrc && im.getBoundingClientRect().width > 0) out.brokenImgs.push(im.currentSrc.slice(0, 160));
        if (en) {
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n; const seen = new Set();
          while ((n = w.nextNode())) {
            const t = n.textContent.replace(/\s+/g, " ").trim(); const el = n.parentElement;
            if (!t || !JP.test(t) || !el || el.closest("script,style,noscript,[data-i18n-audit-ignore],.cl-rootBox")) continue;
            if (/^(日本語|JA)$/.test(t)) continue;
            const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
            if (!seen.has(t)) { seen.add(t); out.jp.push(t.slice(0, 120)); }
          }
          for (const e of document.querySelectorAll("img[alt],[aria-label],[placeholder],[title]")) for (const a of ["alt", "aria-label", "placeholder", "title"]) { const v = e.getAttribute(a); if (v && JP.test(v) && !e.closest("[data-i18n-audit-ignore]")) out.jp.push(`@${a}: ${v.slice(0, 100)}`); }
          out.jp = [...new Set(out.jp)];
        }
        for (const a of document.querySelectorAll("a[href]")) out.links.push(a.href);
        return out;
      }, { jp: JP.source, en: route === "/en" || route.startsWith("/en/") });
      for (const l of m.links) { try { const u = new URL(l); if (u.origin === BASE && !u.pathname.startsWith("/api/")) links.add(u.origin + u.pathname); } catch {} }
      delete m.links;
      results.push({ route, width, status, errors: [...new Set(errors)], failed: [...new Set(failed)], ...m, offscreen: m.offscreen.slice(0, 8) });
    } catch (e) {
      results.push({ route, width, status, error: String(e).slice(0, 200) });
    }
    const r = results.at(-1);
    fs.appendFileSync(JSONL, JSON.stringify(r) + "\n");
    const bad = (r.errors?.length || 0) + (r.failed?.length || 0) + (r.brokenImgs?.length || 0) + (r.overflowX > 2 ? 1 : 0) + (r.offscreen?.length || 0) + (r.jp?.length || 0) + (r.error ? 1 : 0);
    console.log(width, route, status, bad ? `issues=${bad}` : "ok");
    if (bad && process.argv.includes("--verbose")) console.log("   ", JSON.stringify({ e: r.error, js: r.errors, req: r.failed, img: r.brokenImgs, ox: r.overflowX, off: r.offscreen, jp: r.jp?.slice(0, 10) }).slice(0, 1500));
    await p.close();
  }
  await ctx.close();
}
await b.close();

// ページ内リンクの死活（同じサイトのみ）
const deadLinks = [];
for (const u of links) {
  try {
    const r = await fetch(u, { method: "GET", redirect: "follow" });
    if (r.status >= 400) deadLinks.push(`${r.status} ${u}`);
  } catch (e) { deadLinks.push(`ERR ${u} ${String(e).slice(0, 80)}`); }
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, results, deadLinks }, null, 1));
const md = [`# deep-crawl ${BASE}`, "", `pages ${results.length} / links checked ${links.size} / dead ${deadLinks.length}`, ""];
for (const r of results) {
  const parts = [];
  if (r.error) parts.push(`ERROR ${r.error}`);
  if (r.status >= 400 && r.route !== "/this-page-does-not-exist" && r.route !== "/en/this-page-does-not-exist") parts.push(`status ${r.status}`);
  if (r.errors?.length) parts.push(`js: ${r.errors.join(" | ")}`);
  if (r.failed?.length) parts.push(`req: ${r.failed.join(" | ")}`);
  if (r.brokenImgs?.length) parts.push(`img: ${r.brokenImgs.join(" | ")}`);
  if (r.overflowX > 2) parts.push(`横スクロール ${r.overflowX}px`);
  if (r.offscreen?.length) parts.push(`はみ出し: ${r.offscreen.join(" | ")}`);
  if (r.jp?.length) parts.push(`日本語: ${r.jp.slice(0, 15).join(" / ")}`);
  if (parts.length) md.push(`- **${r.width} ${r.route}** — ${parts.join(" ・ ")}`);
}
md.push("", "## リンク切れ", ...deadLinks.map((d) => `- ${d}`));
fs.writeFileSync(path.join(OUT, "report.md"), md.join("\n"));
console.log("done", results.length, "dead links", deadLinks.length);
