import {chromium} from 'playwright';
import fs from 'node:fs';
const out='artifacts/deployed-1c37c60';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});const results=[];
try{
const page=await browser.newPage();
await page.route('**/api/**',r=>r.request().method()==='GET'?r.continue():r.abort());
for(const locale of ['ja','en'])for(const width of [1440,820,390]){
await page.setViewportSize({width,height:900});
const response=await page.goto(`https://locahun3d.com/${locale==='en'?'en/':''}properties/shibuyasq`,{waitUntil:'domcontentloaded'});
await page.locator('[data-property-specs]').waitFor();
await page.evaluate(()=>document.fonts.ready);
await page.locator('[data-property-specs]').scrollIntoViewIfNeeded();
await page.screenshot({path:`${out}/${locale}-${width}.png`});
const groups=await page.locator('[data-property-spec-group]').count();
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
results.push({locale,width,status:response.status(),groups,overflow});
}
console.log(JSON.stringify(results));
if(results.some(r=>r.status!==200||!r.groups||r.overflow))process.exitCode=1;
}finally{await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));}
