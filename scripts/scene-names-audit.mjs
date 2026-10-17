// 使い方: node scripts/scene-names-audit.mjs <物件ID…>
// 公開物件の無料ビューアーを開き、ビューアー上のシーン名を本番版と手元版（offline-viewer.html を差し替え）で比べる。
import {chromium} from 'playwright'; import fs from 'node:fs';
const ids = process.argv.slice(2); const local = fs.readFileSync('public/viewer/offline-viewer.html');
const b = await chromium.launch({channel:'chrome', headless:false});
for (const id of ids) {
  const p = await b.newPage(); await p.goto(`https://locahun3d.com/properties/${id}`, {waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500);
  const hrefs = await p.$$eval('a', as => [...new Set(as.map(a => a.href).filter(h => h.includes('offline-viewer.html')))]); await p.close();
  for (const [k, href] of hrefs.entries()) for (const mode of ['prod', 'local']) {
    const v = await b.newPage();
    if (mode === 'local') await v.route(/\/viewer\/offline-viewer\.html/, r => r.fulfill({status:200, contentType:'text/html; charset=utf-8', body: local}));
    await v.goto(href, {waitUntil:'load'});
    let name = ''; for (let i = 0; i < 40; i++) { await v.waitForTimeout(1000); name = await v.$eval('#tb-project-name', e => e.textContent).catch(() => ''); if (name && name !== 'Untitled Project') break; }
    console.log(id, k, mode, JSON.stringify(name)); await v.close();
  }
  if (!hrefs.length) console.log(id, 'no free viewer link');
}
await b.close();
