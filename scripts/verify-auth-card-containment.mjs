import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// Real Clerk markup, no sign-in/sign-up submission or authentication mutation.
// Rects are essential: body overflow-x:clip hides this regression from scrollWidth.
const base = process.env.BASE_URL || 'http://localhost:3032';
const out = process.env.OUT_DIR || 'artifacts/auth-card-containment';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const results = [];
try {
  const page = await browser.newPage();
  for (const locale of ['ja', 'en']) for (const width of [390, 820, 1440]) for (const route of ['sign-in', 'sign-up']) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/${locale === 'en' ? 'en/' : ''}${route}`, { waitUntil: 'networkidle' });
    await page.locator('.cl-card').waitFor({ state: 'visible' });
    const metrics = await page.evaluate(() => {
      const grid = document.querySelector('main .grid');
      const bounds = grid.getBoundingClientRect();
      const rects = [...grid.querySelectorAll(':scope > div, h1.ui-page-title, .cl-rootBox, .cl-cardBox, .cl-card, input:not([type="hidden"]),button[type="submit"]')].map(el => {
        const r = el.getBoundingClientRect();
        return { name: el.className, left: r.left, right: r.right, width: r.width, contained: r.left >= bounds.left - 2 && r.right <= bounds.right + 2 };
      });
      return { grid: { left: bounds.left, right: bounds.right, width: bounds.width }, rects };
    });
    results.push({ locale, width, route, ...metrics });
    await page.screenshot({ path: `${out}/${locale}-${width}-${route}.png`, fullPage: true });
    const failed = metrics.rects.filter(r => !r.contained);
    console.log(JSON.stringify({ locale, width, route, failed }));
    if (failed.length && process.argv.includes('--fail-fast')) break;
  }
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
const failures = results.filter(r => r.rects.some(e => !e.contained));
console.log(JSON.stringify({ checked: results.length, failures: failures.map(r => `${r.locale}/${r.width}/${r.route}`) }));
if (failures.length) process.exitCode = 1;
