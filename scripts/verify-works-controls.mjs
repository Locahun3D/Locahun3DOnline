import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const out='F:/Codex/works-controls-20260912'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try {
 for(const width of [1440,820,390]) for(const locale of ['ja','en']) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto(`http://localhost:3032/${locale==='en'?'en/':''}works/index.html`);
  await page.waitForTimeout(1000);
  assert.deepEqual(await page.locator('#filters button').allTextContents(),locale==='ja'?['すべて','アート','CG技術','産業']:['All','Art','CG Technology','Industry']);
  assert.equal(await page.locator('.works-subnav').count(),0);
  assert.equal(await page.locator('.cta-panel').count(),0);
  assert.ok(await page.locator('#worksGrid > *').count()<=3);
  for(const [tag,count] of [['art',3],['cg',5],['industry',3]]) {
    await page.locator(`[data-f="${tag}"]`).click();
    assert.equal(await page.locator('#blogGrid > a').count(),count);
    assert.ok((await page.locator('#blogGrid > a').evaluateAll(es=>es.map(e=>e.dataset.tag))).every(t=>t===tag));
  }
  await page.locator('[data-f="all"]').click();
  await page.locator('#filters').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${locale}-${width}.png`});
  // Real production render function, with synthetic extra entries only in the
  // disposable browser. No publication or filesystem/article content changes.
  await page.evaluate(()=>{window.WORKS.push({...window.WORKS[0]},{...window.WORKS[0]});window.renderWorks();});
  assert.equal(await page.locator('#worksGrid > *').count(),3);
  assert.equal(await page.locator('#moreWorksGrid > *').count(),2);
  assert.equal(await page.locator('#moreWorksGrid > *').first().isVisible(),false);
  await page.locator('#moreWorks summary').click();
  assert.equal(await page.locator('#moreWorksGrid > *').first().isVisible(),true);
  console.log(`PASS ${locale} ${width}: filters, removals, first 3 works + expandable remainder`);
  await page.close();
 }
} finally {await browser.close();}
