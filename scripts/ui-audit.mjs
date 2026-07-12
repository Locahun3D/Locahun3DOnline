/**
 * UI監査ハーネス — 複数端末幅 × 全ページ × 状態（ドロワー開閉）で
 * レイアウト崩れを機械検出する。
 *
 *   node scripts/ui-audit.mjs                          # 本番（両サイト）を監査
 *   node scripts/ui-audit.mjs --local                  # localhost:3000 + :8830 を監査
 *   node scripts/ui-audit.mjs --online https://...     # オンライン側のベースURLを指定
 *   node scripts/ui-audit.mjs --scan   https://...     # スキャン側のベースURLを指定
 *
 * 検出項目:
 *   h-overflow      : ページ全体の横スクロール発生（scrollWidth > innerWidth）
 *   overlap         : ヘッダー帯（y<70px）で相互に25%以上重なる操作要素ペア
 *                     （例: ハンバーガーがEN表示を覆う — 実害発生済みの類型）
 *   offscreen       : ヘッダー帯の操作要素が画面外にはみ出している
 *   drawer-offscreen: モバイルドロワーを開いた状態で項目が画面外
 *
 * 問題があれば .ui-audit/ にスクショを保存して exit 1。CIや手動の
 * デプロイ前チェックとして使う。誤検出があればページ/セレクタ単位で
 * 除外を足すこと（黙って閾値を緩めない）。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const local = args.includes("--local");
const ONLINE = flag("--online") ?? (local ? "http://localhost:3000" : "https://locahun3d.com");
const SCAN = flag("--scan") ?? (local ? "http://localhost:8830" : "https://web.locahun3d.com");

const SCAN_JA = [
  "locahun3d_manifesto.html", "locahun3d_data.html", "locahun3d_pitch_hub.html",
  "locahun3d_online.html", "locahun3d_demo.html", "locahun3d_contact.html", "locahun3d_privacy.html",
];
const PAGES = [
  // オンライン（Next.js）
  ...["/", "/properties", "/pricing", "/about", "/contact",
    "/contact/bug", "/contact/request", "/contact/listing", "/contact/general",
    "/en", "/en/properties", "/en/pricing", "/en/about"].map((p) => ({ url: ONLINE + p, site: "online" })),
  // スキャン（静的HTML）
  ...SCAN_JA.map((p) => ({ url: `${SCAN}/${p}`, site: "scan" })),
  ...SCAN_JA.filter((p) => p !== "locahun3d_contact.html").map((p) => ({ url: `${SCAN}/en/${p}`, site: "scan" })),
];

const VIEWPORTS = [
  [320, 568], [360, 740], [390, 844], [414, 896],
  [768, 1024], [820, 1180], [1024, 768], [1280, 800], [1440, 900],
];

/** ページ内で実行する検査本体（シリアライズされる） */
const AUDIT = () => {
  const out = [];
  const vw = innerWidth;
  if (document.documentElement.scrollWidth > vw + 2) {
    out.push({ type: "h-overflow", detail: `${document.documentElement.scrollWidth}>${vw}` });
  }
  const els = [...document.querySelectorAll("a, button, [role=button]")].filter((e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 4 && r.height > 4 && r.top < 70 && r.bottom > 0 &&
      cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  });
  const label = (e) => (e.textContent || e.getAttribute("aria-label") || e.className || "").trim().slice(0, 25);
  const rects = els.map((e) => ({ e, r: e.getBoundingClientRect() }));
  for (let i = 0; i < rects.length; i++) {
    const { e, r } = rects[i];
    if (r.right > vw + 1 || r.left < -1) out.push({ type: "offscreen", el: label(e) });
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      if (e.contains(b.e) || b.e.contains(e)) continue;
      const ix = Math.max(0, Math.min(r.right, b.r.right) - Math.max(r.left, b.r.left));
      const iy = Math.max(0, Math.min(r.bottom, b.r.bottom) - Math.max(r.top, b.r.top));
      const minA = Math.min(r.width * r.height, b.r.width * b.r.height);
      // 閾値10%: 25%では「僅かに食い込む」接触を見逃した実績があるため厳しめに。
      if (ix * iy > minA * 0.10) {
        out.push({ type: "overlap", a: label(e), b: label(b.e), pct: Math.round((ix * iy / minA) * 100) });
      }
    }
  }
  return out;
};

const DRAWER_AUDIT = () => {
  const out = [];
  const links = [...document.querySelectorAll('#mNav a, [class*="z-[60]"] a, [class*="z-[60]"] button')];
  for (const a of links) {
    const r = a.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right > innerWidth + 1 || r.left < -1) {
      out.push({ type: "drawer-offscreen", el: (a.textContent || "").trim().slice(0, 20) });
    }
  }
  return out;
};

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync(".ui-audit", { recursive: true });
const issues = [];
let shot = 0;

for (const { url, site } of PAGES) {
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch {
      issues.push({ url, vw: w, type: "load-failed" });
      continue;
    }
    await page.waitForTimeout(500);
    const found = await page.evaluate(AUDIT);
    for (const f of found) {
      issues.push({ url, vw: w, state: "closed", ...f });
      await page.screenshot({ path: `.ui-audit/issue-${++shot}.png` }).catch(() => {});
    }
    // モバイル幅ではドロワー開状態も検査
    if (w <= 414) {
      const toggle = site === "scan" ? "#mToggle" : 'header button[aria-expanded]';
      const t = page.locator(toggle).first();
      if (await t.count()) {
        await t.click().catch(() => {});
        await page.waitForTimeout(450);
        const dFound = await page.evaluate(DRAWER_AUDIT);
        for (const f of dFound) {
          issues.push({ url, vw: w, state: "drawer", ...f });
          await page.screenshot({ path: `.ui-audit/issue-${++shot}.png` }).catch(() => {});
        }
      }
    }
  }
  process.stdout.write(".");
}
console.log("");
await browser.close();

if (issues.length === 0) {
  console.log(`✔ UI audit passed — ${PAGES.length} pages × ${VIEWPORTS.length} viewports, no issues.`);
  process.exit(0);
}
console.log(`✘ ${issues.length} issue(s) found:`);
for (const i of issues) console.log(JSON.stringify(i));
console.log(`Screenshots: .ui-audit/`);
process.exit(1);
