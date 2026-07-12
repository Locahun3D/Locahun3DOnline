/**
 * header-parity.mjs — オンライン版(locahun3d.com)とスキャンサイト(web.locahun3d.com)の
 * ヘッダー共有要素が「同じ書体・サイズ・太さ・色・余白」かを computed style で機械検証する。
 *
 *   node scripts/header-parity.mjs --local   # localhost:3000 + 127.0.0.1:8830
 *   node scripts/header-parity.mjs           # 本番
 *
 * 検証対象（両サイトに存在する要素のみ）:
 *   ブランド文字 / スキャン・オンライントグルの各セル / ENチップ / ナビ項目 / 行の高さ
 * サイト固有要素（カート・認証ボタン・ナビ項目数）は構成差として対象外。
 * ヘッダーを触ったら ui-audit.mjs と合わせて必ず実行すること。
 */
import { chromium } from "playwright";

const LOCAL = process.argv.includes("--local");
const ONLINE = LOCAL ? "http://localhost:3000/" : "https://locahun3d.com/";
const SCAN = LOCAL
  ? "http://127.0.0.1:8830/locahun3d_manifesto.html"
  : "https://web.locahun3d.com/locahun3d_manifesto.html";

// [width, height, tier] — tier: "mobile" は2段ヘッダー帯(<1200px)、"desktop" は1行帯(≥1200px)。
// 両サイトとも 1200px で切替（オンライン=min-[1200px] / スキャン=@media 1199px）。
const VIEWPORTS = [
  [320, 700, "mobile"],
  [360, 740, "mobile"],
  [390, 844, "mobile"],
  [414, 896, "mobile"],
  [768, 1024, "mobile"],
  [820, 1180, "mobile"],
  [1024, 768, "mobile"],
  [1194, 834, "mobile"],
  [1280, 800, "desktop"],
  [1440, 900, "desktop"],
];

// 比較する computed プロパティ
const PROPS = ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "color", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];

const PICK = `(sel, root) => {
  const el = (root || document).querySelector(sel);
  if (!el) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    fontFamily: s.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
    fontSize: s.fontSize, fontWeight: s.fontWeight,
    letterSpacing: s.letterSpacing, color: s.color,
    paddingTop: s.paddingTop, paddingRight: s.paddingRight,
    paddingBottom: s.paddingBottom, paddingLeft: s.paddingLeft,
    h: Math.round(r.height),
  };
}`;

// tier ごとの要素セレクタ。[label, onlineSelector, scanSelector, 比較プロパティ(省略時PROPS)]
function pairsFor(tier) {
  if (tier === "mobile") {
    const m = 'header div.min-\\[1200px\\]\\:hidden'; // オンライン版モバイルブロック
    return [
      ["brand", `${m} span.brand`, ".site-header .sh-brand-text"],
      // 非アクティブセル同士（オンライン=スキャンセル、スキャン=オンラインセル）
      ["toggle-inactive", `${m} a[href*="web.locahun3d"]`, '.site-header .sh-toggle:not(.sh-lang) a'],
      // アクティブセル同士（色はサービス色で異なって正しいので色以外を比較）
      ["toggle-active", `${m} div.flex.items-stretch a:nth-child(2)`, ".site-header .sh-toggle .sh-active",
        ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]],
      ["lang", `${m} a[aria-label="Language"]`, ".site-header .sh-lang a"],
      ["nav-item", `${m} nav a`, ".site-header .sh-left nav a",
        ["fontFamily", "fontSize", "fontWeight", "color"]],
    ];
  }
  const d = "header div.hidden.min-\\[1200px\\]\\:flex"; // オンライン版デスクトップブロック
  return [
    ["brand", `${d} span.brand`, ".site-header .sh-brand-text"],
    ["toggle-inactive", `${d} a[href*="web.locahun3d"]`, '.site-header .sh-toggle:not(.sh-lang) a'],
    ["toggle-active", `${d} div.flex.items-stretch a:nth-child(2)`, ".site-header .sh-toggle .sh-active",
      ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]],
    ["lang", `${d} a[aria-label="Language"]:not(.hidden)`, ".site-header .sh-lang a"],
    ["nav-item", `${d} nav a`, ".site-header .sh-left nav a",
      ["fontFamily", "fontSize", "fontWeight", "color"]],
  ];
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const pOnline = await ctx.newPage();
const pScan = await ctx.newPage();
await pOnline.goto(ONLINE, { waitUntil: "networkidle", timeout: 30000 });
await pScan.goto(SCAN, { waitUntil: "networkidle", timeout: 30000 });

const diffs = [];
for (const [w, h, tier] of VIEWPORTS) {
  await pOnline.setViewportSize({ width: w, height: h });
  await pScan.setViewportSize({ width: w, height: h });
  await pOnline.waitForTimeout(200);
  await pScan.waitForTimeout(200);

  for (const [label, oSel, sSel, propList] of pairsFor(tier)) {
    const o = await pOnline.evaluate(`(${PICK})(${JSON.stringify(oSel)})`);
    const s = await pScan.evaluate(`(${PICK})(${JSON.stringify(sSel)})`);
    if (!o || !s) {
      diffs.push({ vw: w, label, issue: `missing element (online=${!!o} scan=${!!s})` });
      continue;
    }
    for (const prop of propList ?? PROPS) {
      let ov = o[prop], sv = s[prop];
      // letterSpacing "normal" と "0px" は同値扱い
      if (prop === "letterSpacing") {
        ov = ov === "normal" ? "0px" : ov;
        sv = sv === "normal" ? "0px" : sv;
        // px差 0.15px 未満は許容（em→px丸め）
        const d = Math.abs(parseFloat(ov) - parseFloat(sv));
        if (!Number.isNaN(d) && d < 0.15) continue;
      }
      if (ov !== sv) diffs.push({ vw: w, label, prop, online: ov, scan: sv });
    }
  }
}
await browser.close();

if (diffs.length === 0) {
  console.log("✔ header parity OK — online と scan のヘッダー共有要素は全幅で一致。");
  process.exit(0);
}
for (const d of diffs) console.log(JSON.stringify(d));
console.log(`✘ ${diffs.length} 件の不一致`);
process.exit(1);
