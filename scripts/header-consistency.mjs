/**
 * header-consistency.mjs — スキャンサイトの全ページ×全端末幅で
 * ヘッダーが「1ピクセルも違わない」ことを機械証明する。
 *
 *   node scripts/header-consistency.mjs --local   # 127.0.0.1:8830
 *   node scripts/header-consistency.mjs           # 本番 web.locahun3d.com
 *
 * 背景: ヘッダーCSSが各HTMLへコピペされ3系統へdriftし、
 * 「ページによって文字サイズや幅が変わる」不具合が発生した。
 * 現在は assets/site-header.css が唯一のソース。本スクリプトはその不変条件を守る。
 *
 * 検査内容（幅ごとに全ページを比較）:
 *   1. consistency : ブランド/トグル/ENチップ/ナビ項目/ヘッダー高 の computed style が全ページ一致
 *   2. overlap     : デスクトップ帯でナビが中央ブランドに重ならない
 *   3. overflow    : 横スクロールが発生しない
 * ヘッダーを触ったら header-parity.mjs / ui-audit.mjs と併せて必ず実行すること。
 */
import { chromium } from "playwright";

const LOCAL = process.argv.includes("--local");
const BASE = LOCAL ? "http://127.0.0.1:8830" : "https://web.locahun3d.com";

const PAGES = [
  "/locahun3d_manifesto.html", "/locahun3d_data.html", "/locahun3d_demo.html",
  "/locahun3d_contact.html", "/locahun3d_privacy.html",
  "/en/locahun3d_manifesto.html", "/en/locahun3d_data.html",
  "/en/locahun3d_demo.html", "/en/locahun3d_privacy.html",
  "/works/index.html", "/works/chevron-rokunowa-mv.html",
  "/works/houdini-comfyui-gsplat-workflow.html", "/works/portalcam-drone-ai-workflow.html",
  "/works/ue5-xgrids-3dgs-aerial-ai.html",
  "/en/works/index.html", "/en/works/chevron-rokunowa-mv.html",
  "/en/works/houdini-comfyui-gsplat-workflow.html", "/en/works/portalcam-drone-ai-workflow.html",
  "/en/works/ue5-xgrids-3dgs-aerial-ai.html",
];

// 実機の幅を網羅する。720/1024 は帯の境界、744/810/834 は iPad mini6 / 10.2 / Pro11 縦。
const WIDTHS = [320, 360, 390, 414, 430, 719, 720, 744, 768, 810, 820, 834, 1023, 1024, 1080, 1133, 1180, 1200, 1280, 1366, 1440, 1560, 1920];

// ページ内で採取する指標。言語で中身が変わる文字列は見ない（数値・書体のみ）。
const PROBE = () => {
  const S = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return "MISSING";
    const s = getComputedStyle(el);
    return [s.fontFamily.split(",")[0].replace(/["']/g, "").trim(), s.fontSize, s.fontWeight,
      s.letterSpacing, s.color, s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join("|");
  };
  const header = document.querySelector(".site-header");
  const nav = [...document.querySelectorAll(".site-header .sh-left nav a")];
  const center = document.querySelector(".site-header .sh-center");
  const hr = header ? header.getBoundingClientRect() : null;
  const last = nav.length ? nav[nav.length - 1].getBoundingClientRect() : null;
  const cr = center ? center.getBoundingClientRect() : null;
  const codeEl = nav[0] ? nav[0].querySelector(".code") : null;
  return {
    sig: [S(".site-header .sh-brand-text"), S(".site-header .sh-toggle .sh-active"),
      S(".site-header .sh-lang a"), S(".site-header .sh-left nav a"),
      header ? Math.round(hr.height) : "NOHEADER",
      codeEl ? getComputedStyle(codeEl).display : "nocode",
      nav.length].join("~"),
    // 重なり判定は「ナビが1行に並ぶ帯(≥1024px)」でのみ意味を持つ。
    // 2段ヘッダー(<720px)ではナビが下段、ハンバーガー帯(720–1023px)ではナビが
    // ドロワー内（初期は display:none で rect が全部0）なので左右比較は無意味。
    // ⚠ 経緯: 1200px → 768px → 1024px（帯構成の変更に追従）。
    overlap: last && cr && window.innerWidth >= 1024 ? Math.round(cr.left - last.right) : null,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
  };
};

const problems = [];
const browser = await chromium.launch();
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  // 言語ごとに比較する。JA/EN でラベル長が違うとナビの折返し行数＝ヘッダー高が変わるのは
  // 内容差であってCSSのdriftではないため、混ぜると偽陽性になる。
  const seen = { ja: new Map(), en: new Map() }; // locale -> sig -> [pages]
  for (const p of PAGES) {
    // networkidle / load は外部フォント待ちでハングし得るので使わない（実際に固まった）。
    let res = null, err = "";
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
      if (attempt) await page.waitForTimeout(300); // 直前の遷移を落ち着かせてから再試行
      res = await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 20000 })
        .catch((e) => { err = String(e.message || e).split("\n")[0].slice(0, 80); return null; });
    }
    if (!res || !res.ok()) { problems.push({ w, p, type: "load", detail: res ? res.status() : err }); continue; }
    // 共有CSS(site-header.css)が適用され切るまで待つ。ヘッダーCSSを外部ファイルへ出したので
    // DOMContentLoaded 直後は未適用の瞬間があり、そこで測ると偽の不一致を拾う。
    const waitStyled = () => page.waitForFunction(() => {
      const el = document.querySelector(".site-header");
      return !!el && getComputedStyle(el).position === "fixed";
    }, null, { timeout: 10000 }).then(() => true).catch(() => false);
    let styled = await waitStyled();
    if (!styled) { // ローカルサーバのつまり等の一過性を1回だけ許容
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      styled = await waitStyled();
    }
    if (!styled) { problems.push({ w, p, type: "header-css-not-applied", detail: "site-header.css 未適用" }); continue; }
    // webフォント確定待ち（固定sleepだと flaky）。取得できない環境でも進めるよう上限付き。
    await page.evaluate(() => Promise.race([
      document.fonts.ready.then(() => true),
      new Promise((r) => setTimeout(() => r(false), 3000)),
    ])).catch(() => {});
    const r = await page.evaluate(PROBE);
    const loc = p.startsWith("/en/") ? "en" : "ja";
    if (!seen[loc].has(r.sig)) seen[loc].set(r.sig, []);
    seen[loc].get(r.sig).push(p);
    if (r.overflowX > 2) problems.push({ w, p, type: "h-overflow", detail: r.overflowX });
    if (r.overlap !== null && r.overlap < 0) problems.push({ w, p, type: "nav-overlaps-brand", detail: r.overlap });
  }
  for (const loc of ["ja", "en"]) {
    const m = seen[loc];
    if (m.size > 1) {
      const groups = [...m.entries()].map(([sig, ps]) => `${ps.length}p: ${ps.slice(0, 3).join(",")}${ps.length > 3 ? "…" : ""}`);
      problems.push({ w, p: `*(${loc})`, type: "inconsistent-header", detail: `${m.size} variants → ${groups.join(" || ")}` });
    }
  }
  await ctx.close();
  process.stdout.write(".");
}
await browser.close();

console.log("");
if (!problems.length) {
  console.log(`✔ header consistency passed — ${PAGES.length} pages × ${WIDTHS.length} widths, all identical.`);
  process.exit(0);
}
console.log(`✘ ${problems.length} issue(s):`);
for (const p of problems) console.log(JSON.stringify(p));
process.exit(1);
