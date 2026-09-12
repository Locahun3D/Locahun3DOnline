import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const out='F:/Codex/online-purchase-review-20260912/catalog';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 for(const en of [false,true]) for(const [width,touch] of [[1440,false],[820,true],[1366,true],[390,true]]){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:touch});const page=await context.newPage();
  await page.goto(`http://localhost:3032${en?'/en':''}/properties`,{waitUntil:'networkidle'});
  const filter=page.getByRole('button',{name:en?/Filters/:/絞り込み検索/});if(await filter.isVisible())await filter.click();
  assert.equal(await page.locator('select').filter({has:page.locator('option[value="200"]')}).inputValue(),'200');
  assert.equal(await page.locator('[data-catalog-map]').count(),touch?0:1);
  const details=page.locator('details').filter({has:page.locator('summary',{hasText:en?'Extra filters':'追加条件'})});
  assert.equal(await details.getAttribute('open'),null);await details.locator('summary').click();
  await page.getByRole('button',{name:en?'Parking':'駐車場あり',exact:true}).click();
  const input=page.getByRole('textbox',{name:en?'Reference location':'参照地点'});await input.click();
  await input.fill('35.66, 139.70');await input.press('Enter');assert.equal(await input.inputValue(),'35.66, 139.70');
  const preset=en?'Tokyo Sta.':'東京駅';
  await input.click();await page.getByRole('button',{name:preset,exact:true}).click();assert.equal(await input.inputValue(),preset);
  await page.screenshot({path:`${out}/controls-${en?'en':'ja'}-${width}-${touch?'touch':'mouse'}.png`});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
 }
 console.log('PASS 200km default, extra-filter dropdown, editable reference + preset, desktop-only map, 4 viewports');
}finally{await browser.close()}
