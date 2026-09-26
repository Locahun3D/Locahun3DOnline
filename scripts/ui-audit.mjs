/**
 * UI監査ハーネス — 複数端末幅 × 全ページ × 状態（ドロワー開閉）で
 * レイアウト崩れを機械検出する。
 *
 *   node scripts/ui-audit.mjs                          # 本番（両サイト）を監査
 *   node scripts/ui-audit.mjs --chrome                 # インストール済み実Chromeで監査
 *   node scripts/ui-audit.mjs --local                  # localhost:3000 + :8830 を監査
 *   node scripts/ui-audit.mjs --online https://...     # オンライン側のベースURLを指定
 *   node scripts/ui-audit.mjs --scan   https://...     # スキャン側のベースURLを指定
 *   --widths 390,820,1440 --paths /,/en,/pricing      # bounded focused checks
 *   --out artifacts/ui-audit-current                 # evidence destination
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
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const local = args.includes("--local");
const ONLINE = flag("--online") ?? (local ? "http://localhost:3000" : "https://locahun3d.com");
const SCAN = flag("--scan") ?? (local ? "http://localhost:8830" : "https://web.locahun3d.com");

const PAGES = [
  // オンライン（Next.js）
  // ⚠ 2026-08-16: /about は "/" の #service へ、/demo は /pricing へ統合（どちらも redirect）。
  //    着地先の "/" と "/pricing"（/en 版含む）で検査する。
  ...["/", "/properties", "/pricing", "/contact", "/privacy",
    "/contact/scan", "/contact/request", "/contact/listing", "/contact/license",
    "/en", "/en/properties", "/en/pricing", "/en/contact", "/en/privacy",
    "/en/contact/scan", "/en/contact/request", "/en/contact/listing", "/en/contact/license"].map((p) => ({ url: ONLINE + p, site: "online" })),
  // works（実績＆技術ブログ）— 2026-09-03 にオンライン版へ統合。ホストは
  // web.locahun3d.com のまま（URL不変・本人指示）。一覧と記事1本を見る。
  // ⚠ ローカル検証は --scan http://localhost:3005 を渡すこと（統合後の works は
  //    オンライン版の Next ルート /works/[page] が出す）。
  ...["works/index.html", "works/isaacsim-3dgs-robot-demos.html", "en/works/index.html"]
    .map((p) => ({ url: `${SCAN}/${p}`, site: "scan" })),
  // Retired static URLs are host-specific redirects, not independent pages.
  // Audit their current destinations above; redirect contracts belong in a separate check.
];

const VIEWPORTS = [
  [320, 568], [360, 740], [390, 844], [414, 896],
  [768, 1024], [820, 1180], [1024, 768], [1280, 800], [1440, 900],
].filter(([w]) => !flag("--widths") || flag("--widths").split(",").map(Number).includes(w));
const selectedPages = flag("--paths")
  ? flag("--paths").split(",").map(p => ({url: new URL(p, ONLINE).href, site: "online"}))
  : PAGES;
if (!VIEWPORTS.length) throw new Error("No valid --widths selected");

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
  const links = [...document.querySelectorAll('#header-tablet-nav a, #header-tablet-nav button, #header-account-menu a, #header-account-menu button, #mNav a, [class*="z-[60]"] a, [class*="z-[60]"] button')];
  let visible = 0;
  for (const a of links) {
    const r = a.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    visible++;
    if (r.right > innerWidth + 1 || r.left < -1) {
      out.push({ type: "drawer-offscreen", el: (a.textContent || "").trim().slice(0, 20) });
    }
  }
  if (!visible) out.push({type:"drawer-empty",detail:"No visible drawer controls inspected"});
  return out;
};

// Use the installed, visible Chrome for visual review without a Playwright download.
const browser = await chromium.launch(args.includes("--chrome")
  ? { channel: "chrome", headless: false }
  : {});
const output = flag("--out") || ".ui-audit";
mkdirSync(output, { recursive: true });
const issues = [];
const cases = [];
const redact = (_key,value) => typeof value === "string"
  ? value.replace(/([?&](?:__clerk[^=&#]*|token|nonce|jwt|access_token|id_token|authorization)=)[^&#\s]*/gi,"$1[REDACTED]") : value;
let shot = 0;
const bounded = async (job, label, ms = 10000) => {
  let timer;
  try { return await Promise.race([job, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms); })]); }
  finally { clearTimeout(timer); }
};
try { for (const { url } of selectedPages) {
  for (const [w, h] of VIEWPORTS) {
    const page = await browser.newPage({viewport:{width:w,height:h}});
    page.setDefaultTimeout(5000);
    // The audit never needs a mutation or a gated viewer-asset token.
    await page.route("**/api/**", route => {
      const req=route.request(), path=new URL(req.url()).pathname;
      return !["GET","HEAD"].includes(req.method()) || /\/api\/(viewer-asset|purchase|unlock)(?:\/|$)/.test(path) ? route.abort() : route.continue();
    });
    const record={url,vw:w,finalUrl:null,status:null,drawer:false,pageErrors:[],failedScripts:[]};cases.push(record);
    page.on("pageerror",error=>{record.pageErrors.push({message:error.message,stack:error.stack});});
    page.on("requestfailed",request=>{if(request.resourceType()==="script")record.failedScripts.push({url:request.url(),failure:request.failure()});});
    let stage="navigation";
    console.log(`[${cases.length}/${selectedPages.length*VIEWPORTS.length}] ${w}px ${url} — ${stage}`);
    try {
      const response=await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      record.finalUrl=page.url();record.status=response?.status()??null;
      if(!response||!response.ok()){issues.push({url,vw:w,type:"http-error",status:record.status,finalUrl:record.finalUrl});continue;}
      if(new URL(record.finalUrl).origin!==new URL(url).origin){issues.push({url,vw:w,type:"unexpected-origin",finalUrl:record.finalUrl});continue;}
    stage="geometry";console.log(`  ${record.status} ${record.finalUrl} — ${stage}`);
    await page.waitForTimeout(500);
    const found = await bounded(page.evaluate(AUDIT),stage);
    for (const f of found) {
      issues.push({ url, vw: w, state: "closed", ...f });
    }
    if(found.length){stage="screenshot";await page.screenshot({path:`${output}/issue-${++shot}.png`,timeout:5000});}
    // モバイル幅ではドロワー開状態も検査
    if (w <= 414) {
      // ⚠ :visible 必須。オンライン版のタブレット用ハンバーガー(720–1023pxのみ表示)は
      //   スマホ幅でも DOM には存在するため、:visible が無いと非表示要素を掴んで
      //   click() が30秒タイムアウトし、監査が1ページ2分に激遅化する（実測）。
      const toggle = 'header button[aria-controls="header-tablet-nav"]:visible, #mToggle:visible';
      const t = page.locator(toggle).first();
      if (await t.count()) {
        stage="drawer-click";console.log(`  ${stage}`);
        await t.click({timeout:5000});
        await bounded((async()=>{while(await t.getAttribute("aria-expanded")==="false")await page.waitForTimeout(50);})(),"drawer-expanded",5000);
        record.drawer=true;
        await page.waitForTimeout(450);
        stage="drawer-geometry";
        const dFound = await bounded(page.evaluate(DRAWER_AUDIT),stage);
        for (const f of dFound) {
          issues.push({ url, vw: w, state: "drawer", ...f });
        }
        if(dFound.length){stage="drawer-screenshot";await page.screenshot({path:`${output}/issue-${++shot}.png`,timeout:5000});}
      } else issues.push({url,vw:w,type:"drawer-toggle-missing"});
    }
    } catch(error){issues.push({url,vw:w,type:"audit-failed",stage,detail:String(error.message)});console.log(`  FAIL ${stage}: ${error.message}`);}
    finally {
      await page.close();
      if(record.pageErrors.length)issues.push({url,vw:w,type:"page-error",errors:record.pageErrors});
      if(record.failedScripts.length)issues.push({url,vw:w,type:"script-load-failed",scripts:record.failedScripts});
      writeFileSync(`${output}/results.json`,JSON.stringify({cases,issues},redact,2));
    }
    console.log(`  done ${w}px ${url}`);
  }
}
} finally {await browser.close();}

if (issues.length === 0) {
  console.log(`✔ UI audit passed — ${selectedPages.length} pages × ${VIEWPORTS.length} viewports, no issues.`);
  process.exit(0);
}
console.log(`✘ ${issues.length} issue(s) found:`);
for (const i of issues) console.log(JSON.stringify(i,redact));
console.log(`Screenshots and results: ${output}/`);
process.exit(1);
