/**
 * レイアウト監査（読み取りのみ）— 公開ページ × 端末 × 縦横 で、重なり・はみ出し・文字の切れを機械検出する。
 *
 *   node scripts/layout-overlap-audit.mjs                       # 本番の公開ページ
 *   node scripts/layout-overlap-audit.mjs --base http://localhost:3000
 *   --paths /,/properties/shibuyasq   --out artifacts/layout-audit
 *
 * 検出:
 *   h-overflow : ページ全体が横スクロールする
 *   offscreen  : 見えている要素が画面の右／左にはみ出す（横スクロール容器の中は除く）
 *   clipped    : overflow:hidden の要素で文字が切れている（scrollWidth > clientWidth）
 *   overlap    : 文字・操作要素どうしが 30% 以上重なる（親子・固定ヘッダー・意図した重ね置きは除く）
 * 修正はしない。結果は JSON とスクリーンショットに残す。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const BASE = flag("--base") ?? "https://locahun3d.com";
const OUT = flag("--out") ?? "artifacts/layout-audit";
const PATHS = (flag("--paths") ?? "/,/properties,/properties/shibuyasq,/pricing,/contact,/cart,/en,/en/properties,/en/properties/shibuyasq,/en/pricing").split(",");
const DEVICES = [
  ["iPhoneSE", 320, 568], ["iPhone14", 390, 844], ["iPhoneMax", 430, 932], ["Android", 360, 800],
  ["iPadMini", 768, 1024], ["iPadAir", 820, 1180], ["iPadPro", 1024, 1366],
  ["Laptop", 1280, 800], ["Desktop", 1440, 900], ["Wide", 1920, 1080],
];
mkdirSync(OUT, { recursive: true });

const detect = () => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const desc = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 3).join(".") : ""} "${(e.textContent || "").trim().slice(0, 28)}"`;
  if (document.documentElement.scrollWidth > vw + 1) out.push({ kind: "h-overflow", detail: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}` });
  const inScroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll" || o === "hidden") && p !== document.body && p !== document.documentElement) return true; } return false; };
  const fixed = (e) => { for (let p = e; p; p = p.parentElement) { const s = getComputedStyle(p).position; if (s === "fixed" || s === "sticky") return true; } return false; };
  const visible = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true }) /* 閉じた <details> の中身を除く */ && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05 && r.width > 2 && r.height > 2; };
  const all = [...document.querySelectorAll("body *")].filter(visible);
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if ((r.right > vw + 2 || r.left < -2) && !inScroller(e) && !fixed(e) && e.children.length === 0) out.push({ kind: "offscreen", detail: `${desc(e)} left ${Math.round(r.left)} right ${Math.round(r.right)} / ${vw}`, y: Math.round(r.top + scrollY) });
    const s = getComputedStyle(e);
    if (e.children.length === 0 && (e.textContent || "").trim() && s.overflowX === "hidden" && s.textOverflow !== "ellipsis" && e.scrollWidth > e.clientWidth + 2) out.push({ kind: "clipped", detail: `${desc(e)} ${e.scrollWidth} > ${e.clientWidth}`, y: Math.round(r.top + scrollY) });
  }
  // 重なり: 文字を直接持つ葉要素と操作要素だけを比べる
  const leaves = all.filter((e) => !fixed(e) && (e.matches("a,button,input,select,textarea") || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)));
  const rects = leaves.map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => x.r.width * x.r.height > 60);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w <= 2 || h <= 2) continue;
    const ratio = (w * h) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
    if (ratio < 0.3) continue;
    const posA = getComputedStyle(a.e).position, posB = getComputedStyle(b.e).position;
    out.push({ kind: "overlap", detail: `${desc(a.e)} × ${desc(b.e)} ${(ratio * 100) | 0}%${posA === "absolute" || posB === "absolute" ? " (absolute)" : ""}`, y: Math.round(a.r.top + scrollY) });
  }
  return out;
};

const browser = await chromium.launch({ channel: "chrome" }); // 同梱ブラウザは入れていない。他の検証スクリプトと同じく実 Chrome を使う
const findings = [];
for (const [name, w, h] of DEVICES) for (const orient of ["portrait", "landscape"]) {
  const [vw, vh] = (orient === "portrait") === (h >= w) ? [w, h] : [h, w];
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: Math.min(w, h) < 700, hasTouch: Math.min(w, h) < 1100 });
  const page = await ctx.newPage();
  for (const p of PATHS) {
    try {
      await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1200);
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      const found = await page.evaluate(detect);
      if (found.length) {
        const shot = `${OUT}/${name}-${orient}-${p.replace(/\W+/g, "_") || "home"}.png`;
        await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
        for (const f of found) findings.push({ device: name, orient, viewport: `${vw}x${vh}`, path: p, ...f, shot });
      }
      console.log(name, orient, p, found.length);
    } catch (e) {
      findings.push({ device: name, orient, viewport: `${vw}x${vh}`, path: p, kind: "error", detail: String(e).slice(0, 120) });
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
console.log("total", findings.length);
