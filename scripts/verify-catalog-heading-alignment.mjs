import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = 'artifacts/catalog-heading-alignment';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const results = [];
try {
  const page = await browser.newPage();
  for (const locale of ['ja', 'en']) for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['works/index.html', 'properties', 'properties/wh-002']) {
      await page.goto(`http://localhost:3032/${locale === 'en' ? 'en/' : ''}${path}`, { waitUntil: 'networkidle' });
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        headings: [...document.querySelectorAll('h1, h3.ui-card-title')].map(el => ({
          text: el.textContent, size: getComputedStyle(el).fontSize,
          line: getComputedStyle(el).lineHeight, width: el.clientWidth, scroll: el.scrollWidth,
        })),
      }));
      results.push({ locale, width, path, ...metrics });
      await page.screenshot({ path: `${out}/${locale}-${width}-${path.replaceAll('/', '-')}.png`, fullPage: true });
      assert.equal(metrics.overflow, false, `${path} horizontal overflow`);
      if (path === 'works/index.html') assert.ok(parseFloat(metrics.headings[0]?.size) <= 40, 'Standard works index heading must be <=40px');
      for (const heading of metrics.headings) assert.ok(heading.scroll <= heading.width + 1, 'Heading overflow');
    }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
console.log(`Verified ${results.length} page/locale/width combinations.`);
