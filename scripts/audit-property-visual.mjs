import { chromium } from 'playwright';
import fs from 'node:fs';
const out='F:/Codex/property-audit-20260913';
const browser=await chromium.launch({channel:'chrome',headless:false});
const page=await browser.newPage();const results=[];
try {for(const locale of ['ja','en'])for(const width of [1440,820,390,320]){
 await page.setViewportSize({width,height:900});
 await page.goto('https://locahun3d.com/'+(locale==='en'?'en/':'')+'properties/shibuyasq',{waitUntil:'networkidle'});
 await page.screenshot({path:`${out}/live-${locale}-${width}-top.png`});
 for(const region of ['purchase','access','workspace','license']){
  const el=page.locator(`[data-property-${region}]`).first();await el.scrollIntoViewIfNeeded();
  if(region==='workspace'){await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);}
  await page.screenshot({path:`${out}/live-${locale}-${width}-${region}.png`});
 }
 results.push({locale,width,metrics:await page.evaluate(()=>({
  body:document.body.getBoundingClientRect().toJSON(),width:innerWidth,
  texts:[...document.querySelectorAll('[data-property-license-card] p,[data-property-presentation] > div:first-child > p,[data-property-presentation] > div:first-child > div,[data-property-photos] a')].map(e=>({text:e.textContent,color:getComputedStyle(e).color,font:getComputedStyle(e).fontSize,opacity:getComputedStyle(e).opacity,rect:e.getBoundingClientRect().toJSON()})),
  video:(()=>{const v=document.querySelector('video');return {ready:v.readyState,time:v.currentTime,width:v.videoWidth,height:v.videoHeight};})()
 }))});
 console.log(locale,width);
}}finally{await browser.close();fs.writeFileSync(`${out}/live-metrics.json`,JSON.stringify(results,null,2));}
