import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const out = 'artifacts/form-heading-alignment';
await mkdir(out, { recursive: true });
const paths = ['contact/request', 'contact/listing', 'contact/license', 'contact/scan', 'submit-scan', 'terms/service', 'terms/data-download', 'terms/submission', 'terms/listing-revenue-share', 'terms/tokushoho', 'privacy', 'sign-in', 'sign-up', 'unsubscribe'];
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const results = process.argv.includes('--resume') ? JSON.parse(await readFile(`${out}/results.json`, 'utf8')) : [];
try {
  const page = await browser.newPage();
  for (const locale of ['ja', 'en']) for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of paths) {
      if (results.some(r => r.locale === locale && r.width === width && r.path === path)) continue;
      await page.goto(`http://localhost:3032/${locale === 'en' ? 'en/' : ''}${path}`, { waitUntil: 'networkidle' });
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        titles: [...document.querySelectorAll('h1.ui-page-title')].map(el => ({ text: el.textContent, size: getComputedStyle(el).fontSize, line: getComputedStyle(el).lineHeight, width: el.clientWidth, scroll: el.scrollWidth })),
        shellTop: [...document.querySelectorAll('.ui-page-shell')].map(el => getComputedStyle(el).paddingTop),
        headerGap: [...document.querySelectorAll('.ui-page-header')].map(el => getComputedStyle(el).marginBottom),
      }));
      results.push({ locale, width, path, ...metrics });
      await page.screenshot({ path: `${out}/${locale}-${width}-${path.replaceAll('/', '-')}.png`, fullPage: true });
      console.log(locale, width, path, JSON.stringify(metrics));
    }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
const failures = results.filter(r => r.overflow || r.titles.slice(0, 1).some(h => h.scroll > h.width + 1 || parseFloat(h.size) > 40 || parseFloat(h.size) < 28) || r.shellTop.some(v => v !== (r.width >= 720 ? '32px' : '24px')) || r.headerGap.some(v => v !== (r.width >= 720 ? '32px' : '24px')));
console.log(JSON.stringify({ checked: results.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
