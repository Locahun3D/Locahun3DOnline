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
 *
 * ── --works モード（2026-08-27 追加）─────────────────────────
 *   node scripts/header-parity.mjs --works --local
 *   node scripts/header-parity.mjs --works
 * 実績＆ブログ（web.locahun3d.com/works/**）の帯を検査する。works は URL を
 * 変えられない（共有リンク保護）ので別ドメインのままだが、「別サイトへ飛ばされた
 * 感じ」を消すためヘッダー・フッターだけをオンライン版と一致させてある。
 * 比較対象はブランド文字 / ナビ項目 / EN チップ / ヘッダー高 /
 * フッターの © 行・規約リンク。works 側の正典は
 *   digiroke3d_Web/assets/works-header.css + scripts/sync_header.py
 * ⚠ ポート: --local の works は 127.0.0.1:8830（digiroke3d_Web を配信）。
 *   オンライン側は 3001（header-signedin.mjs と同じ `next dev -p 3001`）。
 */
import { chromium } from "playwright";

const LOCAL = process.argv.includes("--local");
const WORKS = process.argv.includes("--works");
const ONLINE = LOCAL
  ? `http://localhost:${WORKS ? 3001 : 3000}/`
  : "https://locahun3d.com/";
const SCAN = LOCAL
  ? `http://127.0.0.1:8830/${WORKS ? "works/index.html" : "locahun3d_manifesto.html"}`
  : `https://web.locahun3d.com/${WORKS ? "works/index.html" : "locahun3d_manifesto.html"}`;

// [width, height, tier]
//   "mobile"  : 2段ヘッダー帯 (<720px)
//   "tablet"  : ハンバーガー帯 (720–1023px)  ← 左=ハンバーガー/中央=ブランド/右=最小限
//   "desktop" : 1行フルナビ帯 (>=1024px)
// 切替幅は両サイト共通（オンライン=min-[720px]/max-[1024px] / スキャン=@media）。
// ⚠ 経緯: 1200px → 768px → 720px。1200pxの頃はオンライン版の html zoom で
// レイアウト実効幅が広いのにヘッダーだけ2段になり2段目が空白になっていた。
// 768pxだと iPad mini 6 縦(744px)がスマホ扱いに落ちるため 720px まで下げた。
// tablet/desktop は同じDOMブロックを使う（ナビがドロワーに入るだけ）ので
// pairsFor() では同じセレクタ集合で比較する。ただしドロワー内のナビは
// 両サイトとも 14px、1行時は 13px と帯で値が違うので tier で期待値を分ける。
// 本スクリプトは位置ではなく書体/寸法のみを比較する（ブランド中心X座標の
// 一致検証は別途 --local 実測で行う）。
const VIEWPORTS = [
  [320, 700, "mobile"],
  [360, 740, "mobile"],
  [390, 844, "mobile"],
  [414, 896, "mobile"],
  [430, 932, "mobile"],
  [719, 1024, "mobile"],
  // ── タブレット縦（ハンバーガー帯 720–1023px）。実機の縦幅を網羅する。
  [720, 1024, "tablet"],
  [744, 1133, "tablet"],  // iPad mini 6
  [768, 1024, "tablet"],  // iPad 9.7 / mini 5
  [810, 1080, "tablet"],  // iPad 10.2 (9th)
  [820, 1180, "tablet"],  // iPad Air 11
  [834, 1194, "tablet"],  // iPad Pro 11
  [1023, 768, "tablet"],
  // ── 1行フルナビ帯（≥1024px）
  [1024, 1366, "desktop"], // iPad Pro 12.9 縦
  [1024, 768, "desktop"],
  [1080, 810, "desktop"],
  [1133, 744, "desktop"],
  [1180, 820, "desktop"],
  [1194, 834, "desktop"],
  [1280, 800, "desktop"],
  [1366, 1024, "desktop"],
  [1440, 900, "desktop"],
];

// 比較する computed プロパティ
const PROPS = ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "color", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];

const PICK = `(sel, root) => {
  // ⚠ 同じ要素がバーとドロワーの両方に存在し得る（狭い幅では退避させるため）。
  //    必ず「表示されている方」を採る。querySelector 先頭固定だと非表示側を掴む。
  const all = [...(root || document).querySelectorAll(sel)];
  const el = all.find((e) => e.getBoundingClientRect().width > 3) || null;
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

// 要素セレクタ。2026-07-28 にヘッダーを「全幅1ブロック」へ統一したので tier 分岐は無い。
// 旧版は `header div.min-[720px]:hidden`（2段ブロック）を見ていたため、
// 構造変更後は全件 "missing element" になっていた。構造を変えたらここも直すこと。
const PAIRS = [
  ["brand", "header a[aria-label] span.brand", ".site-header .sh-brand-text"],
  // 非アクティブセル同士（オンライン=スキャンセル、スキャン=オンラインセル）
  ["toggle-inactive", 'header a[href*="web.locahun3d"]', ".site-header .sh-toggle:not(.sh-lang) a"],
  // アクティブセル同士（色はサービス色で異なって正しいので色以外を比較）
  ["toggle-active", "header div.items-stretch a:nth-child(2)", ".site-header .sh-toggle .sh-active",
    ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]],
  ["lang", 'header a[aria-label="Language"]', ".site-header .sh-lang a, .site-header .sh-drawer-lang"],
  ["nav-item", "header nav a", ".site-header .sh-left nav a",
    ["fontFamily", "fontSize", "fontWeight", "color"]],
];

// works 用。works にはスキャン/オンライン トグルが無い（オンライン版と同じ構成）ので、
// 共通要素はブランド・ナビ・EN・帯の高さ・フッターだけ。
// ⚠ フッターは works 側だけ zoom で倍率を合わせている（オンライン版は html の zoom
//   の内側にある）。computed の fontSize は zoom 前の値なので、この照合は
//   「同じ CSS px を使っているか」を見る。実寸の一致はスクショ比較側の担当。
const WORKS_PAIRS = [
  ["brand", "header a[aria-label] span.brand", ".site-header.sh-works .sh-brand-text"],
  ["nav-item", "header nav a", ".site-header.sh-works .sh-left nav a",
    ["fontFamily", "fontSize", "fontWeight", "color"]],
  ["lang", 'header a[aria-label="Language"]', ".site-header.sh-works .sh-lang"],
  ["header-h", "header", ".site-header.sh-works", ["h"]],
  ["foot-copy", "footer .mono", ".site-foot .sf-copy"],
  ["foot-link", "footer nav a", ".site-foot .sf-links a",
    ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "color"]],
];
function pairsFor() { return WORKS ? WORKS_PAIRS : PAIRS; }

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
    // 両サイトとも非表示なら一致（ドロワーに畳まれている等）。
    // 片方だけ出ているのは「退避の閾値が両サイトでずれている」ので不一致にする。
    if (!o && !s) continue;
    if (!o || !s) {
      diffs.push({ vw: w, label, issue: `片方だけ表示 (online=${!!o} scan=${!!s})` });
      continue;
    }
    for (const prop of propList ?? PROPS) {
      let ov = o[prop], sv = s[prop];
      // next/font はフォント名を `__Noto_Sans_JP_1a2b3c` のようなハッシュ付きに
      // 差し替える。静的サイト側は素の "Noto Sans JP" なので、比較の前に戻す。
      if (prop === "fontFamily") {
        const norm = (v) => String(v).replace(/^__(.+?)_[0-9a-f]+$/, "$1").replace(/_/g, " ");
        ov = norm(ov); sv = norm(sv);
      }
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
