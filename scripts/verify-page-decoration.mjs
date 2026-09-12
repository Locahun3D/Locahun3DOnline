import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const out = 'F:/Codex/page-decoration-20260912';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({channel:'chrome',headless:false});
try {
  for (const width of [1440,820,390]) {
    for (const route of ['/pricing','/contact','/privacy','/works/index.html']) {
      const page=await browser.newPage({viewport:{width,height:900}});
      await page.goto('http://localhost:3032'+route,{waitUntil:'domcontentloaded'});
      await page.locator('h1').first().waitFor();
      const bad = await page.locator('.chapter-rule').evaluateAll(nodes=>nodes.map(n=>n.textContent).filter(t=>/PRICING|CONTACT\s*0\.4|LEGAL\s*Privacy/.test(t)));
      assert.deepEqual(bad,[],route+' has no redundant opening stripe');
      if(route.includes('works')) {
        assert.equal(await page.locator('.tcr').count(),0,'no decorative reel/year strip');
        assert.equal(await page.locator('.hero .kick').count(),0,'no duplicate works subtitle');
        assert.equal(await page.locator('.works-root .chapter-rule').count(),0,'no duplicate numbered index section labels');
      }
      await page.waitForTimeout(400);
      await page.screenshot({path:out+'/'+route.replaceAll('/','_')+'-'+width+'.png'});
      console.log('PASS',route,width,await page.locator('h1').first().innerText());
      await page.close();
    }
  }
} finally {await browser.close();}
