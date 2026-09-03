/**
 * header-signedin.mjs — **サインイン状態**のヘッダーを実Chromeで総当たり検査する。
 *
 *   npx next dev -p 3001                 # 別ターミナルで（テスト鍵の .env.local を読ませる）
 *   node scripts/header-signedin.mjs     # 既定 http://localhost:3001
 *   node scripts/header-signedin.mjs --base http://localhost:3001
 *
 * ── なぜ専用ハーネスが要るのか ────────────────────────────────
 * ヘッダーの右側はサインイン時にだけ重くなる（EN / カート / 権限バッジ /
 * マイページ / 通知ベル / アバター）。サインアウトで測っている限り、
 * 右が軽いので衝突が起きず、**存在するバグが1件も出ない**。
 * 2026-07-29、サインアウトで Chrome+WebKit 各500計測が全て合格した直後に
 * ユーザーの「ログイン状態でも確認した？」で回してみたところ、
 *   1536px以上: EN × アバター が 28px 重なり
 *   1920px    : EN × マイページ が 33.8px 重なり
 * が即座に出た。header-matrix.mjs はサインアウト専用なので、これと対で回すこと。
 *
 * ── ログインの作り方（CAPTCHA は迂回しない） ──────────────────
 * サインアップ画面は Cloudflare Turnstile が入るため自動操作できない。
 * 代わりに Clerk 公式のバックエンドAPIで
 *   1. 検証専用ユーザーを作る（無ければ）
 *   2. sign_in_token を発行する
 *   3. /sign-in?__clerk_ticket=... を開く
 * という正規の手順を使う。**開発インスタンス(sk_test)専用**。
 * 本番鍵では実行しない（下でガードしている）。
 *
 * ⚠ `next start` は .env.production.local（本番鍵）を読むため localhost では
 *   Clerk 自体が起動せず、サインイン/サインアウトのどちらのUIも出ない。
 *   必ず `next dev`（.env.local = pk_test）に対して回すこと。
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = arg("--base") || "http://localhost:3001";
const EMAIL = "locahun.headercheck@example.com";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SK = env.CLERK_SECRET_KEY || "";
if (!/^sk_test/.test(SK)) {
  console.error("開発用の CLERK_SECRET_KEY(sk_test...) が .env.local にありません。中止します。");
  process.exit(2);
}
const H = { Authorization: "Bearer " + SK, "Content-Type": "application/json" };
const api = async (path, init) => (await fetch("https://api.clerk.com/v1" + path, { headers: H, ...init })).json();

const found = await api("/users?email_address=" + encodeURIComponent(EMAIL));
let user = Array.isArray(found) && found[0];
if (!user) {
  user = await api("/users", { method: "POST", body: JSON.stringify({
    email_address: [EMAIL], password: "Loca-hdr-check-2026!", first_name: "ヘッダー", last_name: "検証" }) });
  if (!user.id) { console.error("検証ユーザーの作成に失敗:", JSON.stringify(user).slice(0, 300)); process.exit(2); }
}
const ticket = await api("/sign_in_tokens", { method: "POST", body: JSON.stringify({ user_id: user.id, expires_in_seconds: 1800 }) });
if (!ticket.token) { console.error("サインインチケットの発行に失敗:", JSON.stringify(ticket).slice(0, 300)); process.exit(2); }

// ⚠ headed（実Chrome）。ヘッドレスはスクロールバーが重なり型で、
//    スクロールバー由来のズレが構造的に再現しない（docs/header-rules.md R7）。
const W = [320, 360, 375, 390, 430, 600, 719, 720, 744, 767, 768, 820, 834,
  1023, 1024, 1100, 1199, 1200, 1366, 1440, 1535, 1536, 1600, 1920];
// works（実績＆技術ブログ）も 2026-09-03 の統合で本物のヘッダーになった。
// 記事ページは本文が独自CSS（黒地・独自リセット）を持つので、ログイン済みで
// 右側が最も重い状態でヘッダーが崩れないかをここでも見る。
const PATHS = ["/", "/properties", "/pricing", "/account", "/dashboard", "/cart", "/en/properties",
  "/works/index.html", "/works/isaacsim-3dgs-robot-demos.html"];

const b = await chromium.launch({ headless: false, channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/sign-in?__clerk_ticket=${ticket.token}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(9000);
const signedIn = await p.evaluate(() =>
  /マイページ|My Page/.test(document.querySelector("header")?.textContent || ""));
if (!signedIn) { console.error("サインインできていません（ヘッダーにマイページが出ない）。中止します。"); await b.close(); process.exit(2); }

const PROBE = () => {
  const hd = document.querySelector("header");
  if (!hd) return { e: "ヘッダーが無い" };

  // ⚠ 判定は「実際に描かれている矩形」で行う。要素の getBoundingClientRect を
  //    そのまま使うと、祖先の overflow で切り取られて**画面に出ていない部分**まで
  //    重なりに数えてしまう。Clerk の UserButton は内部に position:absolute の
  //    装飾要素を持ち、それが親の外（左隣のリンクの上）へ35px はみ出す。
  //    見た目もクリックも親側でクリップされているのに、素朴な矩形判定では
  //    「マイページ×SPAN 27px」として 97 件の偽陽性を出した（2026-07-29 実測）。
  const visibleRect = (el) => {
    let r = el.getBoundingClientRect();
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflow === "visible" && cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const p = n.getBoundingClientRect();
      r = {
        left: Math.max(r.left, p.left), right: Math.min(r.right, p.right),
        top: Math.max(r.top, p.top), bottom: Math.min(r.bottom, p.bottom),
      };
      r.width = r.right - r.left;
      r.height = r.bottom - r.top;
      if (r.width <= 0 || r.height <= 0) return null;
    }
    return r;
  };

  // 表示中の「葉」要素だけを対象にする（親子は必ず重なるため）
  const els = [];
  for (const e of hd.querySelectorAll("a,button,span,img")) {
    if (getComputedStyle(e).visibility === "hidden") continue;
    if ([...e.children].some((c) => c.getBoundingClientRect().width >= 4)) continue;
    const r = visibleRect(e);
    if (!r || r.width < 4 || r.height < 4) continue;
    els.push({ e, r });
  }
  const label = (x) => ((x.e.textContent || x.e.getAttribute("aria-label") || x.e.tagName).trim().slice(0, 10));
  const ov = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    if (els[i].e.contains(els[j].e) || els[j].e.contains(els[i].e)) continue;
    const a = els[i].r, c = els[j].r;
    const x = Math.min(a.right, c.right) - Math.max(a.left, c.left);
    const y = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
    if (x > 1 && y > 1) ov.push(`${label(els[i])}×${label(els[j])}(${x.toFixed(1)}px)`);
  }

  const hr = hd.getBoundingClientRect();
  const brand = [...hd.querySelectorAll("a[aria-label]")].find((e) => e.getBoundingClientRect().width > 5);
  if (!brand) return { e: "ブランドが見つからない" };
  // ⚠ 幅>5 で絞る。375px未満はトグルがバーから●パネルへ退避し、
  //    閉じたパネル内の要素は矩形0になる。絞らないとそれを掴んで
  //    「中心が-121pxずれた」と誤検出する（実測）。
  const tg = [...hd.querySelectorAll("a,span")]
    .find((e) => /^オンライン$|^Online$/.test((e.textContent || "").trim()) && e.getBoundingClientRect().width > 5);
  // 中心は「ヘッダー自身の中心」基準（clientWidth/2 だとスクロールバーの有無で
  // ページごとに 7.5px ずれ、動いていないヘッダーを誤検出する）。
  // トグルがバーに無い帯（375px未満）は「ブランド単独が中央」が正しい姿。
  const br = brand.getBoundingClientRect();
  const g = tg
    ? (br.left + tg.getBoundingClientRect().right) / 2 - (hr.left + hr.width / 2)
    : (br.left + br.right) / 2 - (hr.left + hr.width / 2);
  return { ov, g: +g.toFixed(1), h: +hr.height.toFixed(1),
    of: document.documentElement.scrollWidth - document.documentElement.clientWidth };
};

const bad = [];
for (const path of PATHS) {
  for (const w of W) {
    await p.setViewportSize({ width: w, height: 900 });
    const r = await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    if (!r || !r.ok()) { bad.push(`${path} @${w} 読み込み失敗 ${r && r.status()}`); continue; }
    await p.waitForTimeout(700);
    const res = await p.evaluate(PROBE);
    if (res.e) { bad.push(`${path} @${w} ${res.e}`); continue; }
    if (res.ov.length) bad.push(`${path} @${w} 重なり: ${res.ov.join(", ")}`);
    if (res.g === null) bad.push(`${path} @${w} 中央要素が見つからない`);
    else if (Math.abs(res.g) > 1) bad.push(`${path} @${w} 中心ズレ ${res.g}px`);
    if (res.h !== 56) bad.push(`${path} @${w} ヘッダー高 ${res.h}`);
    if (res.of > 2) bad.push(`${path} @${w} 横はみ出し ${res.of}`);
  }
  process.stdout.write(".");
}
await b.close();
console.log(`\n計測: ${PATHS.length * W.length} ／ 問題: ${bad.length}`);
for (const x of bad.slice(0, 40)) console.log("  ", x);
process.exit(bad.length ? 1 : 0);
