import fs from 'node:fs';
import {chromium} from 'playwright';

const out=process.env.QA_OUT||'artifacts/works-spacing';fs.mkdirSync(out,{recursive:true});
const base=process.env.BASE_URL||'http://localhost:3032';
const browser=await chromium.launch({channel:'chrome',headless:false});const results=[];
try{
 for(const locale of (process.env.QA_LOCALES?.split(',')||['ja','en']))for(const width of (process.env.QA_WIDTHS?.split(',').map(Number)||[1440,820,390])){
  const page=await browser.newPage({viewport:{width,height:900}});const blocked=[];
  await page.route('**/api/**',route=>{const r=route.request();if(r.method()==='GET'&&r.url().includes('/api/r2/'))return route.continue();blocked.push({url:r.url(),method:r.method()});return route.fulfill({status:200,contentType:'application/json',body:'{}'});});
  await page.goto(`${base}/${locale==='en'?'en/':''}works/index.html`,{waitUntil:'domcontentloaded'});
  await page.locator('#blogGrid > a').first().waitFor();
  await page.locator('#worksGrid').scrollIntoViewIfNeeded();
  await page.locator('#blogGrid').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));
  const before=await page.locator('#blogGrid > a').evaluateAll(ns=>ns.map(n=>({href:n.getAttribute('href'),tag:n.dataset.tag})));
  const geometry=await page.locator('#blog').evaluate(e=>{
   const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y+scrollY,width:r.width,height:r.height,right:r.right,bottom:r.bottom+scrollY}};
   const heading=e.querySelector('.section-head'),filters=e.querySelector('#filters'),grid=e.querySelector('#blogGrid'),h=rect(heading),f=rect(filters),g=rect(grid),b=rect(e),prev=rect(e.previousElementSibling);
   const zoom=parseFloat(getComputedStyle(document.documentElement).zoom)||1;
   const hero=document.querySelector('.works-root .hero'),title=hero.querySelector('h1'),worksGrid=document.querySelector('#worksGrid'),wt=rect(title),wg=rect(worksGrid);
   const textLeft=n=>{const range=document.createRange();range.selectNodeContents(n);return range.getBoundingClientRect().left;};
   return{blog:b,heading:h,filters:f,grid:g,previous:prev,worksTitle:wt,worksGrid:wg,headingLeftDelta:textLeft(title)-textLeft(heading.querySelector('h2')),worksCardGap:wg.y-wt.bottom,heroBorderBottom:parseFloat(getComputedStyle(hero).borderBottomWidth),zoom,gapFromWorks:b.y-prev.bottom,gapToFilters:f.y-h.bottom,gapToGrid:g.y-Math.max(h.bottom,f.bottom),textAlign:getComputedStyle(heading).textAlign,titleFont:parseFloat(getComputedStyle(heading.querySelector('h2')).fontSize),overflow:g.right>innerWidth+1||f.right>innerWidth+1};
  });
  const errors=[],near=(actual,want)=>Math.abs(actual-want)<1.2;
  const centered=await page.locator('.works-root .hero h1,#blog .section-head h2').evaluateAll(ns=>ns.every(n=>{const r=document.createRange();r.selectNodeContents(n);const t=r.getBoundingClientRect(),p=n.getBoundingClientRect();return Math.abs(t.left+t.width/2-p.left-p.width/2)<2;}));
  if(!centered)errors.push('Heading text not centered');
  if(!near(geometry.worksCardGap,28.8))errors.push('Works heading/card gap differs: '+geometry.worksCardGap);
  if(geometry.heroBorderBottom!==0)errors.push('Unnecessary hero bottom border remains');
  const finalUrl=page.url();if(new URL(finalUrl).origin!==new URL(base).origin)errors.push('Unexpected external redirect');
  if(geometry.textAlign!=='center')errors.push('Blog heading not centered');
  if(!near(geometry.titleFont,width===1440?60:42))errors.push('Original heading size changed');
  if(!near(geometry.gapFromWorks,width<720?38.4:57.6))errors.push('Wrong space after works: '+geometry.gapFromWorks);
  if(!near(geometry.gapToGrid,width<720?27.2:28.8))errors.push('Wrong space before article grid: '+geometry.gapToGrid);
  if(width>=720){if(!near(geometry.gapToFilters,28.8))errors.push('Desktop heading/filter gap wrong');}
  else if(!near(geometry.gapToFilters,19.2))errors.push('Mobile heading/filter gap wrong: '+geometry.gapToFilters);
  if(geometry.overflow)errors.push('Horizontal overflow');
  const filterResults=[];
  for(const tag of ['art','cg','industry','all']){
   await page.locator(`#filters [data-f="${tag}"]`).click();
   const actual=await page.locator('#blogGrid > a').evaluateAll(ns=>ns.map(n=>({href:n.getAttribute('href'),tag:n.dataset.tag})));
   const expected=tag==='all'?before:before.filter(n=>n.tag===tag);
   if(JSON.stringify(actual)!==JSON.stringify(expected))errors.push('Filter content/order changed: '+tag);
   if(!(await page.locator(`#filters [data-f="${tag}"]`).getAttribute('class')).includes('active'))errors.push('Filter active state missing: '+tag);
   filterResults.push({tag,count:actual.length});
  }
  await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot({path:`${out}/${locale}-${width}-initial.png`});
  await page.screenshot({path:`${out}/${locale}-${width}-whole-page.png`,fullPage:true});
  await page.screenshot({path:`${out}/${locale}-${width}-sections-comparison.png`,fullPage:true,clip:{x:0,y:0,width,height:Math.ceil(geometry.grid.y+Math.min(260,geometry.grid.height))}});
  results.push({locale,width,finalUrl,geometry,filterResults,blocked,errors});console.log(locale,width,errors.length?errors:'PASS');await page.close();
 }
}finally{await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify({cases:results.length,failures:results.filter(r=>r.errors.length)},null,2));if(results.some(r=>r.errors.length))process.exitCode=1;
