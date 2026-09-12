import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='F:/Codex/home-contact-cleanup-20260912';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{for(const lang of ['','/en'])for(const width of [1440,820,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.goto(`http://localhost:3032${lang}/cart`,{waitUntil:'networkidle'});
 const font=await page.locator('h1').evaluate(e=>getComputedStyle(e).fontSize);
 await page.goto(`http://localhost:3032${lang}/contact`,{waitUntil:'networkidle'});
 await page.screenshot({path:`${out}/contact-${lang?'en':'ja'}-${width}.png`});
 assert.equal(await page.locator('h1').evaluate(e=>getComputedStyle(e).fontSize),font);
 const body=await page.locator('main').innerText();
 assert(!body.includes('/contact/'));assert(!body.includes('まずはお気軽に'));
 const cards=page.locator('[data-contact-options] > a');assert.equal(await cards.count(),3);
 if(width>=820){const boxes=await cards.evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom}}));assert(Math.max(...boxes.map(b=>b.top))-Math.min(...boxes.map(b=>b.top))<1);assert(Math.max(...boxes.map(b=>b.bottom))-Math.min(...boxes.map(b=>b.bottom))<1);}
 await page.goto(`http://localhost:3032${lang||'/'}`,{waitUntil:'networkidle'});
 const images=page.locator('#service .segments .segment img');assert.equal(await images.count(),3);
 for(const img of await images.all()){await img.scrollIntoViewIfNeeded();assert.equal(await img.evaluate(e=>getComputedStyle(e).objectFit),'contain');}
 await page.locator('#service .segments').screenshot({path:`${out}/audiences-${lang?'en':'ja'}-${width}.png`});
 assert.equal(await page.locator('#service > .wrap > .chapter-rule').count(),0);
 assert.equal(await page.getByText('スキャン（撮影）のご依頼は',{exact:false}).count(),0);
 if(!lang)await page.getByRole('heading',{name:'機能の詳細',exact:true}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth*(parseFloat(getComputedStyle(document.documentElement).zoom)||1)<=innerWidth+1));
 await page.close();
}console.log('PASS contact typography/cards and uncropped home images JA/EN 1440/820/390');}finally{await browser.close();}
