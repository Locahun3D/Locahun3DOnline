/**
 * header-live.mjs — ヘッダーの「ブランドが画面中央にあるか」「要素が重なっていないか」を
 * 両サイト同時に、既定では **本番** で検査する。
 *
 *   node scripts/header-live.mjs           # 本番 (locahun3d.com / web.locahun3d.com)
 *   node scripts/header-live.mjs --local   # localhost:3000 / 127.0.0.1:8830
 *
 * ── なぜ既存の3本と別に要るのか ────────────────────────────────
 * header-parity.mjs   … 両サイトの共有要素の computed style を照合（書体・寸法）
 * header-consistency.mjs … スキャン19ページが互いに1pxも違わないことを保証
 * ui-audit.mjs        … ページ全体の重なり・はみ出し（ヘッダー専用ではない）
 *
 * どれも「ブランドの水平中心が両サイトで一致しているか」を見ていないため、
 * 2026-07-28 に 1199→1200px でブランドが 84px 飛ぶ回帰を素通しした
 * （iPad帯だけ中央固定にし、PC帯が旧来のグループ中央寄せのまま残った）。
 *
 * さらに重要なのが **ローカルと本番で右側の要素数が違う** こと。
 * オンライン版の未ログイン時は EN / カート / ログイン / 新規登録 の4項目が並ぶが、
 * dev で Clerk の読み込みが間に合わないと2項目しか出ず、最も混む状態を測れない。
 * 実際 720px の重なり(-6px)はローカルで再現せず本番で初めて出た。
 * → 本検査は **既定を本番** にし、右側の項目数も一緒に出す。
 *
 * ⚠ 720px未満は2段ヘッダー（ブランド=上段左 / ナビ=下段）なので中央判定はしない。
 *   上下に分かれた要素同士を左右で比べても意味がないため、重なり判定も行を跨ぐ組は除外する。
 */
import { chromium } from "playwright";

const LOCAL = process.argv.includes("--local");
const ONLINE = LOCAL ? "http://localhost:3000" : "https://locahun3d.com";
const SCAN = LOCAL ? "http://127.0.0.1:8830" : "https://web.locahun3d.com";

/** 実機幅 + 帯の境界（境界は「前後1pxで飛ばないこと」の証明に要る）。 */
const WIDTHS = [
  360, 390, 430, 719,          // スマホ(2段) — 重なり・はみ出しのみ
  720, 730, 744, 768, 810, 820, 834, 1023, 1024, 1080, 1133, 1180, 1194, 1199,
  1200, 1280, 1366, 1440, 1535, 1536, 1680, 1920,
];

/** オンライン版は右側が最も混む /properties（未ログイン=4項目）を主対象にする。 */
const PAGES = [
  { site: "online", base: ONLINE, path: "/properties" },
  { site: "online", base: ONLINE, path: "/" },
  { site: "scan", base: SCAN, path: "/locahun3d_manifesto.html" },
  { site: "scan", base: SCAN, path: "/works/index.html" },
];

const CENTER_TOLERANCE = 1; // px。ズーム倍率由来の丸めを吸収する

const PROBE = () => {
  const hd = document.querySelector(".site-header") || document.querySelector("header");
  if (!hd) return { error: "header未検出" };
  // scan は .sh-brand、online は aria-label 付きのブランドリンク。
  // ⚠ 必ず「表示されている方」を選ぶ。オンライン版は1行ヘッダーと2段ヘッダーの
  //   両方が DOM に存在し、帯外の方は display:none で rect が 0 になる。
  //   querySelector で先頭を取ると 720px未満で常に幅0を掴む（実際にやらかした）。
  const brand = [...hd.querySelectorAll(".sh-brand, a[aria-label]")]
    .find((e) => e.getBoundingClientRect().width > 5);
  if (!brand) return { error: "brand未検出(表示中のものが無い)" };
  const r = brand.getBoundingClientRect();

  const els = [...hd.querySelectorAll("a,button")]
    .map((e) => ({ e, q: e.getBoundingClientRect(), t: (e.textContent || e.getAttribute("aria-label") || "?").trim().slice(0, 8) }))
    .filter((o) => o.q.width > 3 && o.q.height > 3);

  const overlaps = [];
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], c = els[j];
      if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
      const x = Math.min(a.q.right, c.q.right) - Math.max(a.q.left, c.q.left);
      const y = Math.min(a.q.bottom, c.q.bottom) - Math.max(a.q.top, c.q.top);
      if (x > 1 && y > 1) overlaps.push(`${a.t}×${c.t}(${Math.round(x)}px)`);
    }
  }
  return {
    center: +((r.left + r.right) / 2).toFixed(1),
    viewportCenter: window.innerWidth / 2,
    overlaps: [...new Set(overlaps)],
    items: els.length,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
  };
};

const problems = [];
const browser = await chromium.launch();
const centers = {}; // width -> site -> center（両サイト差の照合用）

for (const pg of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 800 } });
  const page = await ctx.newPage();
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    // networkidle / load は外部フォント待ちでハングし得るので使わない。
    const res = await page
      .goto(pg.base + pg.path, { waitUntil: "domcontentloaded", timeout: 45000 })
      .catch((e) => { problems.push({ w, pg: pg.path, type: "load", detail: String(e.message || e).slice(0, 60) }); return null; });
    if (!res) continue;
    await page.evaluate(() => Promise.race([
      document.fonts.ready.then(() => true),
      new Promise((r) => setTimeout(() => r(false), 3000)),
    ])).catch(() => {});
    // Clerk のボタンは後から差し込まれる。最も混む状態を測るために猶予を置く。
    await page.waitForTimeout(600);

    const r = await page.evaluate(PROBE);
    const id = `${pg.site}${pg.path}`;
    if (r.error) { problems.push({ w, pg: id, type: "probe", detail: r.error }); continue; }
    if (r.overflowX > 2) problems.push({ w, pg: id, type: "h-overflow", detail: r.overflowX });
    if (r.overlaps.length) problems.push({ w, pg: id, type: "header-overlap", detail: r.overlaps.join(",") });
    if (w >= 720) {
      const off = +(r.center - r.viewportCenter).toFixed(1);
      if (Math.abs(off) > CENTER_TOLERANCE) {
        problems.push({ w, pg: id, type: "brand-not-centered", detail: `${off}px (中心${r.center}/画面中央${r.viewportCenter})` });
      }
      (centers[w] ||= {})[pg.site] = r.center;
    }
  }
  await ctx.close();
  process.stdout.write(".");
}
await browser.close();

// 両サイトのブランド中心が一致しているか（中央判定を両方通っていれば自明だが、
// 許容誤差の積み上がりを見逃さないよう差そのものも見る）。
for (const w of Object.keys(centers)) {
  const c = centers[w];
  if (c.online != null && c.scan != null) {
    const d = Math.abs(c.online - c.scan);
    if (d > CENTER_TOLERANCE) {
      problems.push({ w: +w, pg: "*", type: "cross-site-diff", detail: `${d.toFixed(1)}px (online ${c.online} / scan ${c.scan})` });
    }
  }
}

console.log("");
if (!problems.length) {
  console.log(`✔ header live OK — ${LOCAL ? "ローカル" : "本番"} ${PAGES.length}ページ × ${WIDTHS.length}幅、`
    + `ブランド中心のズレ0・両サイト差0・ヘッダー内重なり0・横スクロール0。`);
  process.exit(0);
}
console.log(`✘ ${problems.length} 件:`);
for (const p of problems) console.log(JSON.stringify(p));
process.exit(1);
