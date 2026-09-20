// サインイン状態のページの i18n（EN の未翻訳）＋レイアウト監査（2026-09-21）。
// 2026-09-20 の scripts/i18n-audit.mjs は「サインアウトの公開ページ」しか見ていない。
// マイページ・ダッシュボード・カート・物件ページのログイン限定UIは丸ごと未検査だったので、
// Clerk の開発インスタンス(sk_test)にテストユーザーを作ってサインインし、
// EN/JA × 1440/820/390 で同じ検出をかける。
//
//   npx next dev -p 3013        （別ターミナル）
//   node scripts/i18n-audit-signedin.mjs [--base http://localhost:3013] [--out artifacts/i18n-signedin] [--no-shots]
//
// 出力: <out>/report.json, <out>/report.md, <out>/<page>-<幅>.png
// 終了コード: EN の未翻訳 or レイアウト不具合が1件でもあれば 1。
//
// ⚠ サインインは header-signedin.mjs / admin-shots.mjs と同じ正規手順
//   （Clerk バックエンドAPIで sign_in_token → /sign-in?__clerk_ticket=...）。
//   本番鍵では走らない（下でガード）。管理者にはしない（ADMIN_BOOTSTRAP_EMAILS に入れない）。
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const BASE = arg("--base", "http://localhost:3013").replace(/\/$/, "");
const OUT = arg("--out", "artifacts/i18n-signedin");
const SHOTS = !process.argv.includes("--no-shots");
const WIDTHS = [1440, 820, 390];
// i18n-audit.mjs と同じ判定（全角の約物も EN では漏れとして拾う）
const JP = /[ぁ-ゖァ-ヺ一-鿿、。「」（）〜～]/;

// ── 物件データ（日本語で入力されEN値が無いもの）は UI の漏れと区別する ──
const rawData = JSON.parse(fs.readFileSync("data/properties.json", "utf8"));
const properties = Array.isArray(rawData) ? rawData : rawData.properties ?? [];
const dataStrings = new Set();
(function walk(v) {
  if (typeof v === "string") { if (JP.test(v)) dataStrings.add(v.replace(/\s+/g, " ").trim()); }
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object") Object.values(v).forEach(walk);
})(properties);
const dataList = [...dataStrings];
const isData = (s) => dataList.some((d) => d === s || (s.length >= 4 && d.length >= 4 && (d.includes(s) || s.includes(d))));

const firstId = properties.find((p) => p.status === "published")?.id ?? properties[0]?.id;

// ログインが要る / ログインで見た目が変わるユーザー向けページ（/admin は対象外）。
// ⚠ マイページのお知らせバナー（notice/welcome/nda/plan）は **クエリでしか出ない**。
//   素の /account だけ見ていると、EN でこのバナーが日本語のままでも気付けない。
//   副作用ゼロ（GET のみ）なので状態違いを全部並べる。
const PATHS = [
  "/account",
  "/account?welcome=done", "/account?welcome=pending",
  "/account?notice=already-onboarded", "/account?notice=already-production",
  "/account?notice=upgrade-pending", "/account?notice=nda-not-production", "/account?notice=other",
  "/account?nda=blocked", "/account?nda=ok", "/account?plan=pro",
  "/account/upgrade",
  "/dashboard", "/dashboard/purchases", "/dashboard/unlocked", "/dashboard/bookmarks",
  "/onboarding", "/cart", "/pricing",
  firstId ? `/properties/${firstId}` : null,
  "/contact", "/contact/scan", "/contact/request", "/contact/listing", "/contact/license",
  "/submit-scan", "/unsubscribe",
].filter(Boolean);

// ── 文字列 → ソースの場所（src/ のみ。admin は触らないので除外） ──
const srcFiles = [];
(function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.generated|admin/.test(p)) collect(p); }
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p);
  }
})("src");
const srcCache = new Map();
function locate(s) {
  const needles = [s, s.slice(0, 14), s.slice(0, 8)].filter((n, i, a) => n.length >= 2 && a.indexOf(n) === i);
  for (const n of needles) {
    for (const f of srcFiles) {
      if (!srcCache.has(f)) srcCache.set(f, fs.readFileSync(f, "utf8").split(/\r?\n/));
      const i = srcCache.get(f).findIndex((l) => l.includes(n) && !/^\s*(\/\/|\*|\{\/\*)/.test(l));
      if (i >= 0) return `${f.replace(/\\/g, "/")}:${i + 1}`;
    }
  }
  return "(not found in src — data / generated / 3rd party)";
}

// ── Clerk（開発インスタンス）でテストユーザーを用意してサインインする ──
const EMAIL = "locahun.usercheck@example.com";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SK = env.CLERK_SECRET_KEY || "";
if (!/^sk_test/.test(SK)) {
  console.error("開発用の CLERK_SECRET_KEY(sk_test...) が .env.local にありません。中止します。");
  process.exit(2);
}
const H = { Authorization: "Bearer " + SK, "Content-Type": "application/json" };
const api = async (p, init) => (await fetch("https://api.clerk.com/v1" + p, { headers: H, ...init })).json();
// ⚠ 名前は必ず ASCII にする。日本語の氏名にすると「ようこそ、〇〇さん」が
//   EN ページでも日本語を含むため、**利用者名が未翻訳として毎回 4 件出る**。
//   実際の漏れが名前に埋もれるので、検証ユーザーの名前は英字で固定する。
const found0 = await api("/users?email_address=" + encodeURIComponent(EMAIL));
let user = Array.isArray(found0) && found0[0];
if (!user) {
  user = await api("/users", { method: "POST", body: JSON.stringify({
    email_address: [EMAIL], password: "Loca-i18n-check-2026!", first_name: "I18n", last_name: "Check" }) });
  if (!user.id) { console.error("検証ユーザーの作成に失敗:", JSON.stringify(user).slice(0, 300)); process.exit(2); }
} else if (user.first_name !== "I18n" || user.last_name !== "Check") {
  await api(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ first_name: "I18n", last_name: "Check" }) });
}

// ⚠ オンボーディング未完了だと /account も /account/upgrade も requireOnboarded で
//   /onboarding に弾かれ、**マイページ本体を一度も見ないまま「clean」になる**。
//   手元の data/users.json（gitignore・D1 移行前のローカル実装）を直接
//   onboarded 済みにして、両方の状態を見られるようにする。
//   ⚠ フォーム送信はしない（副作用を作らないための直接書き換え）。
//
// ⚠ さらに、購入履歴・閲覧履歴・保存ボードは **中身が無いと空状態しか描かれない**。
//   カード本体・ステータスバッジ・領収書まわりの文言が丸ごと未検査になるので、
//   手元のローカルデータに1件ずつ仕込んでから回す。
//   （どれも gitignore / commit しないローカル dev データ。購入APIは叩かない＝
//     Stripe も走らないし、メールも飛ばない。）
const firstProperty = properties[0] ?? null;
const firstScene = firstProperty?.splatItems?.[0] ?? null;
const USERS_FILE = "data/users.json";
let testUserId = "";
if (fs.existsSync(USERS_FILE)) {
  const db = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  const rec = (db.users ?? []).find((u) => u.email === EMAIL);
  if (rec) {
    testUserId = rec.id;
    rec.onboarded = true;
    rec.name = "I18n Check";
    if (firstProperty) {
      rec.bookmarks = [firstProperty.id];
      rec.bookmarkFolders = [{ id: "fld_i18n", name: "Audit board", createdAt: new Date().toISOString() }];
      rec.bookmarkFolderAssignments = { [firstProperty.id]: "fld_i18n" };
    }
    rec.updatedAt = new Date().toISOString();
    fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
    console.log("data/users.json: 検証ユーザーを onboarded 済み＋ブックマーク入りにしました");
  }
}
const nowIso = new Date().toISOString();
if (testUserId && firstProperty && firstScene) {
  const PUR = "data/purchases.json";
  const pdb = fs.existsSync(PUR) ? JSON.parse(fs.readFileSync(PUR, "utf8")) : { version: 1, purchases: [] };
  const pid = `pur_i18n_${testUserId}`;
  pdb.purchases = (pdb.purchases ?? []).filter((p) => p.id !== pid);
  pdb.purchases.push({
    id: pid, userId: testUserId, userEmail: EMAIL,
    propertyId: firstProperty.id, propertyTitle: firstProperty.title ?? "",
    splatItemId: firstScene.id ?? "", splatItemIndex: 0, itemLabel: firstScene.label ?? "",
    license: firstScene.license ?? "standard", editorialRightsCredit: "",
    termsAgreedAt: nowIso, priceYen: 48000, status: "completed",
    stripeSessionId: "", createdAt: nowIso, completedAt: nowIso, refundReason: "",
  });
  fs.writeFileSync(PUR, JSON.stringify(pdb, null, 2));

  const UNL = "data/view-unlocks.json";
  const udb = fs.existsSync(UNL) ? JSON.parse(fs.readFileSync(UNL, "utf8")) : { version: 1, unlocks: [] };
  const uid = `${testUserId}:${firstProperty.id}:${firstScene.id ?? "0"}`;
  udb.unlocks = (udb.unlocks ?? []).filter((u) => u.id !== uid);
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  udb.unlocks.push({
    id: uid, userId: testUserId, propertyId: firstProperty.id,
    splatItemId: firstScene.id ?? "", splatItemIndex: 0, tokensSpent: 2,
    unlockedAt: nowIso, expiresAt: expires,
  });
  fs.writeFileSync(UNL, JSON.stringify(udb, null, 2));
  console.log("data/purchases.json / data/view-unlocks.json: 検証用の1件を仕込みました");
}
const ticket = await api("/sign_in_tokens", { method: "POST", body: JSON.stringify({ user_id: user.id, expires_in_seconds: 3600 }) });
if (!ticket.token) { console.error("サインインチケットの発行に失敗:", JSON.stringify(ticket).slice(0, 300)); process.exit(2); }

// ── ページ内で走らせる検出器 ──
// (a) EN ページに残る日本語、(b) レイアウト不具合（layout-overlap-audit.mjs と同じ基準）
const PROBE = (jpSrc) => {
  const JP = new RegExp(jpSrc);
  const skip = (el) => !!el.closest('[class*="cl-"], script, style, noscript, template, nextjs-portal, [data-nextjs-toast], [data-i18n-audit-ignore]');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const jp = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.textContent.replace(/\s+/g, " ").trim();
    const el = n.parentElement;
    if (!t || !JP.test(t) || !el || skip(el) || !visible(el)) continue;
    if (/^(日本語|JP|JA)$/.test(t)) continue;  // 言語切替の表記は意図通り
    jp.push({ kind: "text", text: t });
  }
  for (const el of document.querySelectorAll("[placeholder],[title],[aria-label],[alt]")) {
    if (skip(el)) continue;
    for (const a of ["placeholder", "title", "aria-label", "alt"]) {
      const v = (el.getAttribute(a) || "").replace(/\s+/g, " ").trim();
      if (v && JP.test(v) && !/^(日本語)$/.test(v)) jp.push({ kind: a, text: v });
    }
  }
  for (const el of document.querySelectorAll("option")) {
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (t && JP.test(t) && !skip(el)) jp.push({ kind: "option", text: t });
  }
  if (JP.test(document.title)) jp.push({ kind: "document.title", text: document.title });
  const md = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
  if (JP.test(md)) jp.push({ kind: "meta description", text: md });

  // ── レイアウト ──
  const vw = document.documentElement.clientWidth;
  const layout = [];
  const desc = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 3).join(".") : ""} "${(e.textContent || "").trim().slice(0, 28)}"`;
  if (document.documentElement.scrollWidth > vw + 1)
    layout.push({ kind: "h-overflow", detail: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}` });
  const inScroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll" || o === "hidden") && p !== document.body && p !== document.documentElement) return true; } return false; };
  const fixed = (e) => { for (let p = e; p; p = p.parentElement) { const s = getComputedStyle(p).position; if (s === "fixed" || s === "sticky") return true; } return false; };
  // checkVisibility で「閉じた <details> の中身」を確実に除く（layout-overlap-audit.mjs と同じ）
  const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true }) && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05 && r.width > 2 && r.height > 2; };
  const all = [...document.querySelectorAll("body *")].filter(vis);
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if ((r.right > vw + 2 || r.left < -2) && !inScroller(e) && !fixed(e) && e.children.length === 0)
      layout.push({ kind: "offscreen", detail: `${desc(e)} left ${Math.round(r.left)} right ${Math.round(r.right)} / ${vw}` });
    const s = getComputedStyle(e);
    if (e.children.length === 0 && (e.textContent || "").trim() && s.overflowX === "hidden" && s.textOverflow !== "ellipsis" && e.scrollWidth > e.clientWidth + 2)
      layout.push({ kind: "clipped", detail: `${desc(e)} ${e.scrollWidth} > ${e.clientWidth}` });
  }
  const leaves = all.filter((e) => !fixed(e) && (e.matches("a,button,input,select,textarea") || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)));
  // ⚠ 判定は getBoundingClientRect ではなく **行ボックスごと**（getClientRects）に行う。
  //    インライン要素が2行に折り返すと getBoundingClientRect は行の和集合を返すので、
  //    同じラベル内で先に並ぶ「必須」バッジを丸ごと飲み込み、見た目は正常なのに
  //    「100% 重なり」と報告する（2026-09-21 実測: /contact/scan・/contact/license・
  //    /submit-scan @390 と /dashboard/purchases @1440 の4件は全てこれの偽陽性だった）。
  const boxes = leaves
    .map((e) => ({ e, rs: [...e.getClientRects()].filter((r) => r.width * r.height > 60) }))
    .filter((x) => x.rs.length > 0);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    let worst = 0;
    for (const ar of a.rs) for (const br of b.rs) {
      const w = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
      const h = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
      if (w <= 2 || h <= 2) continue;
      worst = Math.max(worst, (w * h) / Math.min(ar.width * ar.height, br.width * br.height));
    }
    if (worst < 0.3) continue;
    layout.push({ kind: "overlap", detail: `${desc(a.e)} × ${desc(b.e)} ${(worst * 100) | 0}%` });
  }
  return { jp, layout };
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: false }); // 同梱ブラウザは未インストール
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
const page = await ctx.newPage();
await page.goto(`${BASE}/sign-in?__clerk_ticket=${ticket.token}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(12000);
const signedIn = await page.evaluate(() => /マイページ|My Page/.test(document.querySelector("header")?.textContent || ""));
if (!signedIn) { console.error("サインインできていません（ヘッダーにマイページが出ない）。中止します。"); await browser.close(); process.exit(2); }
console.log("signed in as", EMAIL);

// カートの実体は localStorage（src/lib/cart.ts）。空のままだと /cart が空状態しか
// 描かず、明細行・ライセンス表記・合計欄の文言を一度も見ないまま終わる。
// 直接1件置く（購入APIは叩かない）。
if (firstProperty && firstScene) {
  await page.evaluate(([propertyId, title, label, license]) => {
    localStorage.setItem("locahun3d:cart:v1", JSON.stringify([
      { propertyId, splatItemIndex: 0, title, label, price: 48000, license },
    ]));
  }, [firstProperty.id, firstProperty.title ?? "", firstScene.label ?? "", firstScene.license ?? "standard"]);
}

const results = {};
for (const p of PATHS) {
  for (const lang of ["ja", "en"]) {
    const route = lang === "en" ? `/en${p}` : p;
    const jpFound = new Map();
    const layoutFound = new Map();
    let status = 0;
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      try {
        const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 120000 });
        status = res?.status() ?? 0;
      } catch { /* networkidle に届かなくても描けた分を見る */ }
      // 副作用の無い開閉だけ開く（送信・購入・トークン消費はしない）。
      // <details> と、開閉トグル（aria-expanded=false）＝ブックマークのポップオーバー・
      // 問い合わせパネル等。ヘッダーは対象外（site-header.tsx は触らない領域）。
      // ⚠ <a> は押さない（遷移して "Execution context was destroyed" で落ちる）。
      //   type="submit" も押さない（フォーム送信＝副作用）。開閉トグルだけを押す。
      await page.evaluate(() => {
        document.querySelectorAll("details").forEach((d) => (d.open = true));
        for (const b of document.querySelectorAll('button[aria-expanded="false"]')) {
          if (b.closest("header") || b.type === "submit") continue;
          try { b.click(); } catch { /* 開かないものは放っておく */ }
        }
      }).catch(() => {});
      await page.waitForTimeout(500);
      // トグルで現れた中の <details> も開く。遷移してしまっていたら戻す。
      if (new URL(page.url()).pathname + new URL(page.url()).search !== route) {
        await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
      }
      await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))).catch(() => {});
      // 遅延読み込みを起こすために一度流す
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      await page.waitForTimeout(700);
      const { jp, layout } = await page.evaluate(PROBE, JP.source);
      if (lang === "en") for (const it of jp) {
        const e = jpFound.get(it.text) ?? { kinds: new Set(), widths: new Set() };
        e.kinds.add(it.kind); e.widths.add(width); jpFound.set(it.text, e);
      }
      for (const it of layout) {
        const e = layoutFound.get(it.kind + "|" + it.detail) ?? { kind: it.kind, detail: it.detail, widths: new Set() };
        e.widths.add(width); layoutFound.set(it.kind + "|" + it.detail, e);
      }
      if (SHOTS) {
        const name = (route.replace(/^\//, "") || "home").replace(/[^\w-]+/g, "_");
        await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true }).catch(() => {});
      }
    }
    const ui = [], data = [];
    for (const [text, e] of jpFound) {
      const row = { text, kinds: [...e.kinds], widths: [...e.widths] };
      if (isData(text)) data.push(row); else ui.push({ ...row, source: locate(text) });
    }
    const layout = [...layoutFound.values()].map((e) => ({ kind: e.kind, detail: e.detail, widths: [...e.widths] }));
    results[route] = { status, ui, data, layout };
    console.log(`${route}  [${status}]  UI ${ui.length}  data ${data.length}  layout ${layout.length}`);
  }
}
await browser.close();

const uiTotal = Object.values(results).reduce((n, p) => n + p.ui.length, 0);
const dataTotal = Object.values(results).reduce((n, p) => n + p.data.length, 0);
const layoutTotal = Object.values(results).reduce((n, p) => n + p.layout.length, 0);
const uiUnique = new Set(Object.values(results).flatMap((p) => p.ui.map((u) => u.text))).size;
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, uiTotal, uiUnique, dataTotal, layoutTotal, pages: results }, null, 2));
let md = `# i18n + layout audit (signed in) — ${BASE}\n\nUI untranslated: **${uiTotal}** (unique ${uiUnique}) / data: ${dataTotal} / layout: **${layoutTotal}**\n`;
for (const [route, p] of Object.entries(results)) {
  if (!p.ui.length && !p.layout.length) { md += `\n## ${route} (HTTP ${p.status}) — clean\n`; continue; }
  md += `\n## ${route} (HTTP ${p.status}) — UI ${p.ui.length} / layout ${p.layout.length}\n`;
  for (const u of p.ui) md += `- [${u.kinds.join(",")}] ${u.text.slice(0, 160)} — \`${u.source}\`\n`;
  for (const l of p.layout) md += `- (${l.kind} @${l.widths.join("/")}) ${l.detail.slice(0, 200)}\n`;
  if (p.data.length) md += `\n_data, not UI:_ ${p.data.map((d) => d.text.slice(0, 40)).join(" ｜ ")}\n`;
}
fs.writeFileSync(path.join(OUT, "report.md"), md);
console.log(`\nUI untranslated: ${uiTotal} (unique ${uiUnique}) / data: ${dataTotal} / layout: ${layoutTotal}\n→ ${path.join(OUT, "report.md")}`);
process.exit(uiTotal + layoutTotal > 0 ? 1 : 0);
