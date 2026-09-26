import fs from 'node:fs';
import {chromium} from 'playwright';
const out=process.env.OUT_DIR||'artifacts/contact-date-wrap';fs.mkdirSync(out,{recursive:true});
const base=process.env.BASE_URL||'http://localhost:3032';
const widths=process.env.WIDTHS?.split(',').map(Number)||[320,390,820,1440];
const browser=await chromium.launch({channel:'chrome',headless:false});const results=[];
try{
 const page=await browser.newPage();
 for(const locale of ['ja','en'])for(const width of widths){
  await page.setViewportSize({width,height:width<500?844:900});
  await page.goto(`${base}/${locale==='en'?'en/':''}contact`,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('h1').waitFor();await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,3000))]));
  const geometry=await page.evaluate(locale=>{
   const dates=[],paragraphs=[...document.querySelectorAll('a[href$="/contact/listing"] p')];
   for(const p of paragraphs){
    const chars=[],walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){const n=walker.currentNode;for(let i=0;i<n.textContent.length;i++){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);chars.push({char:n.textContent[i],y:Math.round(r.getBoundingClientRect().y)});}}
    const text=chars.map(c=>c.char).join(''),date=locale==='ja'?'2026年12月31日':'Dec 31, 2026';const i=text.indexOf(date);
    if(i>=0)dates.push({text,date,rows:[...new Set(chars.slice(i,i+date.length).map(c=>c.y))],breaks:p.querySelectorAll('br').length});
   }
   return{dates,overflow:document.documentElement.scrollWidth>innerWidth+1};
  },locale);
  const errors=[];if(!geometry.dates.length)errors.push('Listing date missing');
  if(geometry.overflow)errors.push('Horizontal overflow');
  for(const d of geometry.dates){if(locale==='ja'&&d.rows.length!==1)errors.push('Japanese listing date split');if(d.breaks!==(locale==='ja'?2:0))errors.push('Sentence-break policy changed');}
  await page.screenshot({path:`${out}/${locale}-${width}-full.png`,fullPage:true});await page.screenshot({path:`${out}/${locale}-${width}-initial.png`});results.push({locale,width,...geometry,errors});
 }
}finally{await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify({cases:results.length,failures:results.filter(r=>r.errors.length)},null,2));if(results.some(r=>r.errors.length))process.exitCode=1;
