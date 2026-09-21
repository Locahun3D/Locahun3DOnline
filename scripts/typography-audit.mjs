/**
 * typography-audit.mjs — 日本語の本文まわりの「間」と読みやすさを、実ブラウザで測って点検する（2026-09-21）。
 *
 *   node scripts/typography-audit.mjs [--base http://localhost:3000] [--paths /properties/xxx,/about]
 *   node scripts/typography-audit.mjs --json    # 機械可読（design-fb-audit.py から呼ぶ用）
 *
 * 本人指摘（2026-09-21）「日本語の段落デザインまだ治ってない／デザインが毎回よくなるような
 * ハーネスを自動化ツールに仕込んでほしい」。目で見て直すだけだと、同じ崩れが何度でも戻ってくる。
 * ここで測るのは、次の4つだけ（ルールは CLAUDE.md の日本語タイポグラフィ）:
 *
 *  1. 段落の間隔がそろっているか（同じ塊の中で、段落どうしの空きが ±2px 以内）
 *  2. 行間 1.7 以上（本文。CLAUDE.md は 1.8 を基準にしている）
 *  3. 字間 0.03em 以上（本文）
 *  4. 段落の中に、行の高さの2倍を超える「空きすぎ」が無いか
 *
 * 失敗したら 1 で終了する。--json のときは結果を JSON で出す。
 */
import { createRequire } from "node:module";
const require = createRequire("F:/Htlml/3DGS/locahun3d_online/package.json");
const { chromium } = require("playwright");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "http://localhost:3000");
const PATHS = arg("--paths", "").split(",").filter(Boolean);
const JSON_OUT = process.argv.includes("--json");
const WIDTHS = [1440, 820, 390];

/** 本文として測る対象。見出し・小さな注記は対象外（行間の基準が違う）。 */
const BODY_SELECTORS = [
  "[data-property-overview-body]",
  ".ui-page-lead",
  "[data-property-amenity-notes]",
];

async function measure(page) {
  return page.evaluate((selectors) => {
    const out = [];
    for (const selector of selectors) {
      for (const block of document.querySelectorAll(selector)) {
        const paras = [...block.children].filter((c) => c.tagName === "P");
        const cs = getComputedStyle(paras[0] || block);
        const fontSize = parseFloat(cs.fontSize) || 15;
        const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.5;
        const letterSpacing = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0;
        const rects = paras.map((p) => p.getBoundingClientRect());
        const gaps = rects.slice(1).map((r, i) => Math.round(r.top - rects[i].bottom));
        out.push({
          selector,
          paragraphs: paras.length,
          gaps,
          lineHeightRatio: +(lineHeight / fontSize).toFixed(2),
          letterSpacingEm: +(letterSpacing / fontSize).toFixed(3),
          maxGapRatio: gaps.length ? +(Math.max(...gaps) / lineHeight).toFixed(2) : 0,
          text: (block.textContent || "").trim().slice(0, 40),
        });
      }
    }
    return out;
  }, selectors());
}

function selectors() { return BODY_SELECTORS; }

function check(found, width, path) {
  const problems = [];
  for (const b of found) {
    if (b.gaps.length > 1) {
      const spread = Math.max(...b.gaps) - Math.min(...b.gaps);
      if (spread > 2) {
        problems.push(`${path} @${width} ${b.selector}: 段落の間隔がそろっていない（${b.gaps.join(" / ")}px）`);
      }
    }
    if (b.paragraphs > 0 && b.lineHeightRatio < 1.7) {
      problems.push(`${path} @${width} ${b.selector}: 行間が狭い（${b.lineHeightRatio}・1.7以上にする）`);
    }
    if (b.paragraphs > 0 && b.letterSpacingEm < 0.03) {
      problems.push(`${path} @${width} ${b.selector}: 字間が狭い（${b.letterSpacingEm}em・0.03em以上にする）`);
    }
    if (b.maxGapRatio > 2) {
      problems.push(`${path} @${width} ${b.selector}: 段落の間が空きすぎ（行の高さの${b.maxGapRatio}倍）`);
    }
  }
  return problems;
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const problems = [];
const blocks = [];
for (const path of PATHS) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector(BODY_SELECTORS.join(","), { timeout: 20000 });
    } catch (e) {
      problems.push(`${path} @${width}: 本文の塊が見つからない（${String(e).slice(0, 80)}）`);
      continue;
    }
    const found = await measure(page);
    blocks.push(...found.map((f) => ({ ...f, width, path })));
    problems.push(...check(found, width, path));
  }
}
await browser.close();

// 何も測れていないのに「OK」と言わない（見かけだけ通る検査にしない）。
if (blocks.length === 0) problems.push("本文の塊を1つも測れていない（対象のページ・セレクタを見直す）");

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: problems.length === 0, problems, blocks }, null, 1));
} else {
  for (const b of blocks) {
    console.log(`${b.path} @${b.width} ${b.selector}: 段落${b.paragraphs} 間隔[${b.gaps.join(",")}] 行間${b.lineHeightRatio} 字間${b.letterSpacingEm}em`);
  }
  console.log(problems.length === 0 ? "OK タイポグラフィの点検を通過" : problems.map((p) => "NG " + p).join("\n"));
}
process.exit(problems.length ? 1 : 0);
