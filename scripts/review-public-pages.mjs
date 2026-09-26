import {chromium} from 'playwright';
import fs from 'node:fs';
const out='artifacts/public-page-review';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
const results=[];
try{
for(const path of (process.env.REVIEW_PATHS?.split(',')||['/','/pricing','/contact','/properties']))for(const width of [1440,820,390]){
 const page=await browser.newPage({viewport:{width,height:900}});
 await page.route('**/api/**',r=>r.request().method()==='GET'?r.continue():r.abort());
 await page.goto('http://localhost:3032'+path,{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('main').first().waitFor();
 await page.evaluate(()=>document.fonts.ready);
 const name=(path==='/'?'home':path.slice(1).replaceAll('/','-'))+'-'+width;
 await page.screenshot({path:`${out}/${name}-initial.png`});
 await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,headings:[...document.querySelectorAll('main h1,main h2')].map(e=>({text:e.textContent,size:getComputedStyle(e).fontSize,align:getComputedStyle(e).textAlign}))}));
 results.push({path,width,...layout});console.log(name,layout.overflow?'OVERFLOW':'captured');await page.close();
}
}finally{await browser.close();const old=fs.existsSync(`${out}/results.json`)?JSON.parse(fs.readFileSync(`${out}/results.json`,'utf8')):[];const merged=new Map(old.map(r=>[`${r.path}:${r.width}`,r]));for(const r of results)merged.set(`${r.path}:${r.width}`,r);fs.writeFileSync(`${out}/results.json`,JSON.stringify([...merged.values()],null,2));}
