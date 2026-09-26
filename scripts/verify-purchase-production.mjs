// Read-only production QA. Run only after the deployment owner confirms completion.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = "https://locahun3d.com";
const root = new URL("../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const out = `${root}artifacts/purchase-production-${Date.now()}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: false });
const results = [];
try {
  const context = await browser.newContext();
  await context.route("**/*", route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.startsWith("/api/purchase") || url.pathname.startsWith("/api/track") ||
        (!["GET", "HEAD", "OPTIONS"].includes(req.method()) && url.pathname !== "/api/cart/prices")) return route.abort();
    return route.continue();
  });
  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } });
  let candidates = process.env.QA_PROPERTY ? [`/properties/${process.env.QA_PROPERTY}`] : [];
  if (!candidates.length) {
    await page.goto(`${base}/properties`, { waitUntil: "networkidle" });
    candidates = await page.locator('a[href*="/properties/"]').evaluateAll(links => [...new Set(links.map(a => new URL(a.href).pathname))].filter(path => /^\/properties\/[^/]+$/.test(path)));
  }
  let selected;
  for (const path of candidates) {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    if (!(await page.getByRole("region", { name: "購入に含まれるデータ" }).count())) continue;
    const propertyId = decodeURIComponent(path.split("/").pop());
    const title = await page.locator("h1").first().innerText();
    const items = Array.from({ length: 20 }, (_, splatItemIndex) => ({ propertyId, splatItemIndex }));
    const response = await page.evaluate(async items => {
      const res = await fetch("/api/cart/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      if (!res.ok) throw new Error(`Read-only metadata request failed: ${res.status}`);
      return res.json();
    }, items);
    const line = response.items?.find(item => item.available && item.purchaseContents?.length);
    if (line) { selected = { path, title, line }; break; }
  }
  if (!selected) throw new Error("No public purchasable item found; do not fabricate production purchase metadata.");
  const { path, title, line } = selected;
  await context.addInitScript(line => localStorage.setItem("locahun3d:cart:v1", JSON.stringify([line])), { propertyId: line.propertyId, splatItemIndex: line.splatItemIndex, title, label: "", price: line.price, license: line.license });
  for (const locale of ["ja", "en"]) for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const kind of ["property", "cart"]) {
      const target = kind === "property" ? path : "/cart";
      await page.goto(`${base}${locale === "en" ? "/en" : ""}${target}`, { waitUntil: "networkidle" });
      const region = page.getByRole("region", { name: locale === "en" ? "Included downloads" : "購入に含まれるデータ" }).first();
      await region.waitFor({ timeout: 20000 });
      await region.scrollIntoViewIfNeeded();
      const text = await region.innerText();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      await page.screenshot({ path: `${out}/${kind}-${locale}-${width}.png`, fullPage: kind === "cart" });
      const main = await page.locator("main").innerText();
      const licenseVisible = kind !== "cart" || main.includes(locale === "en" ? "Selected license" : "選択ライセンス");
      results.push({ kind, locale, width, url: page.url(), text, overflow, licenseVisible });
    }
  }
  console.log(JSON.stringify({ out, selected, results }, null, 2));
  if (results.some(r => r.overflow || !r.licenseVisible)) process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
