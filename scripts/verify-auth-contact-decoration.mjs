import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://localhost:3032';
const out = process.env.OUT_DIR || 'artifacts/auth-contact-decoration';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const results = [];
try {
  const page = await browser.newPage();
  outer: for (const locale of ['ja', 'en']) for (const width of [390, 820, 1440]) for (const route of ['sign-in', 'sign-up', 'contact']) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/${locale === 'en' ? 'en/' : ''}${route}`, { waitUntil: 'networkidle' });
    if (route !== 'contact') await page.locator('.cl-card').waitFor({ state: 'visible' });
    const metrics = await page.evaluate(() => ({
      decorations: [...document.querySelectorAll('main p, main .chapter-rule > span')].filter(el => ['Account', 'Get started', 'Q&A'].includes(el.textContent.trim())).map(el => el.textContent.trim()),
      titleCount: document.querySelectorAll('h1.ui-page-title').length,
      forms: document.querySelectorAll('form').length,
      contactLinks: [...document.querySelectorAll('main a[href*="/contact/"]')].length,
    }));
    results.push({ locale, width, route, ...metrics });
    await page.screenshot({ path: `${out}/${locale}-${width}-${route}.png`, fullPage: true });
    console.log(JSON.stringify(results.at(-1)));
    if (metrics.decorations.length && process.argv.includes('--fail-fast')) break outer;
  }
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
const failures = results.filter(r => r.decorations.length || r.titleCount !== 1 || (r.route === 'contact' ? r.contactLinks < 4 : !r.forms));
console.log(JSON.stringify({ checked: results.length, failures: failures.map(r => `${r.locale}/${r.width}/${r.route}`) }));
if (failures.length) process.exitCode = 1;
