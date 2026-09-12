import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.QA_OUT||'F:/Codex/page-rhythm-20260912';await mkdir(out,{recursive:true});
const base=process.env.QA_BASE||'http://localhost:3032';
const browser=await chromium.launch({channel:'chrome',headless:false});
const results=[];
try{for(const width of [1440,820,390])for(const lang of ['','en/']){
 const page=await browser.newPage({viewport:{width,height:1000}});
 const seen=[];
 for(const path of ['contact','cart','pricing']){
  await page.goto(`${base}/${lang}${path}`,{waitUntil:'networkidle'});
  const h=page.locator('h1').first();
  const m=await h.evaluate(el=>{const s=getComputedStyle(el),header=el.closest('header'),shell=header.parentElement;return {size:s.fontSize,line:s.lineHeight,weight:s.fontWeight,above:getComputedStyle(shell).paddingTop,below:getComputedStyle(header).marginBottom}});
  seen.push(m);
  await page.screenshot({path:`${out}/${lang?'en':'ja'}-${path}-${width}.png`});
 }
 assert.equal(new Set(seen.map(m=>m.size)).size,1,`Inconsistent title sizes ${width}: ${JSON.stringify(seen)}`);
 assert.equal(new Set(seen.map(m=>m.line)).size,1,'Inconsistent heading line height');
 for(const m of seen){assert.equal(m.above,m.below,'Heading group top/bottom gaps should match');assert.equal(m.weight,'700');}
 await page.goto(`${base}/${lang}contact`,{waitUntil:'networkidle'});
 const cards=page.locator('[data-contact-options] > a');
 if(width>=820){const r=await cards.evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();const title=e.firstElementChild.getBoundingClientRect();const last=e.lastElementChild.getBoundingClientRect();return{top:b.top,bottom:b.bottom,title:title.top,cta:last.bottom}}));for(const key of ['top','bottom','title','cta'])assert(Math.max(...r.map(x=>x[key]))-Math.min(...r.map(x=>x[key]))<1,`Unequal card ${key}`);}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth*(parseFloat(getComputedStyle(document.documentElement).zoom)||1)<=innerWidth+1));
 await page.goto(`${base}/${lang}`,{waitUntil:'networkidle'});
 const homeTitle=await page.locator('h1').evaluate(e=>({size:getComputedStyle(e).fontSize,line:getComputedStyle(e).lineHeight}));
 assert.equal(homeTitle.size,seen[0].size,'Home title should share the page scale');
 assert.equal(homeTitle.line,seen[0].line,'Home title should share line height');
 await page.screenshot({path:`${out}/${lang?'en':'ja'}-home-${width}.png`});
 results.push({width,lang:lang||'ja',seen});console.log('PASS',width,lang||'ja');await page.close();
}}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
