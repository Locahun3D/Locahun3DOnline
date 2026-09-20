/**
 * admin-shots.mjs — 管理画面を「PC と iPad」の幅で全ページ撮影し、はみ出し・横スクロールを機械検出する（2026-09-20）。
 *
 *   （別に）ADMIN_BOOTSTRAP_EMAILS=locahun.admincheck@example.com で next dev -p 3001 を起動しておく
 *          → .claude/launch.json の "locahun-admin-audit"
 *   node scripts/admin-shots.mjs [--base http://localhost:3001] [--out artifacts/admin-shots] [--paths /admin/properties,...]
 *
 * ログインは header-signedin.mjs と同じ正規手順（開発用 Clerk のバックエンドAPIで検証ユーザー＋サインインチケット）。
 * **開発インスタンス(sk_test)専用**。検証ユーザーは ADMIN_BOOTSTRAP_EMAILS により「手元の JSON ストアでだけ」管理者になる。
 * 本番の D1・本番 Clerk には触れない。
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = arg("--base") || "http://localhost:3001";
const OUT = arg("--out") || "artifacts/admin-shots";
const EMAIL = "locahun.admincheck@example.com";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SK = env.CLERK_SECRET_KEY || "";
if (!/^sk_test/.test(SK)) { console.error("開発用の CLERK_SECRET_KEY(sk_test...) が .env.local にありません。中止します。"); process.exit(2); }
const H = { Authorization: "Bearer " + SK, "Content-Type": "application/json" };
const api = async (path, init) => (await fetch("https://api.clerk.com/v1" + path, { headers: H, ...init })).json();

const found = await api("/users?email_address=" + encodeURIComponent(EMAIL));
let user = Array.isArray(found) && found[0];
if (!user) {
  user = await api("/users", { method: "POST", body: JSON.stringify({
    email_address: [EMAIL], password: "Loca-adm-check-2026!", first_name: "管理画面", last_name: "検証" }) });
  if (!user.id) { console.error("検証ユーザーの作成に失敗:", JSON.stringify(user).slice(0, 300)); process.exit(2); }
}
const ticket = await api("/sign_in_tokens", { method: "POST", body: JSON.stringify({ user_id: user.id, expires_in_seconds: 1800 }) });
if (!ticket.token) { console.error("サインインチケットの発行に失敗:", JSON.stringify(ticket).slice(0, 300)); process.exit(2); }

const VIEWPORTS = [["pc", 1440, 900], ["ipad-land", 1180, 820], ["ipad-port", 820, 1180]];
const PATHS = (arg("--paths") || "/admin/properties,/admin/notifications,/admin/accounts,/admin/analytics,/admin/subscriptions,/admin/assets,/admin/workflow,/admin/inquiries,/admin/contact-requests,/admin/marketing,/admin/purchases,/admin/submissions,/admin/payouts,/admin/works").split(",");
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ headless: false, channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/sign-in?__clerk_ticket=${ticket.token}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(9000);

const findings = [];
for (const path of PATHS) for (const [name, w, h] of VIEWPORTS) {
  await p.setViewportSize({ width: w, height: h });
  try {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForTimeout(2500);
    // --click "文字": 撮る前に、その文字を含むボタンを押す（エディターのステップ切り替えなど）
    if (arg("--click")) { await p.getByRole("button", { name: new RegExp(arg("--click")) }).first().click().catch(() => {}); await p.waitForTimeout(1200); }
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const off = [...document.querySelectorAll("main *, body > div *")].filter((e) => {
        if (e.children.length) return false;
        const b = e.getBoundingClientRect();
        if (b.width < 2 || b.height < 2 || b.right <= vw + 2) return false;
        for (let n = e.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return false; }
        return true;
      }).slice(0, 5).map((e) => `${e.tagName.toLowerCase()} "${(e.textContent || "").trim().slice(0, 24)}"`);
      return { url: location.pathname, title: document.title, hScroll: document.documentElement.scrollWidth > vw + 1, off, height: document.documentElement.scrollHeight };
    });
    const file = `${OUT}/${path.replace(/\W+/g, "_")}-${name}.png`;
    await p.screenshot({ path: file, fullPage: true });
    findings.push({ path, viewport: name, ...r, shot: file });
    console.log(path, name, r.url !== path ? "→ " + r.url : "", r.hScroll ? "H-SCROLL" : "", r.off.length ? "OFF:" + r.off.join(" | ") : "", r.height);
  } catch (e) { findings.push({ path, viewport: name, error: String(e).slice(0, 160) }); console.log(path, name, "ERROR"); }
}
writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
await b.close();
