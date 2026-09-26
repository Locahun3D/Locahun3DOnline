import {chromium,expect} from 'playwright/test';
import fs from 'node:fs';
const out='artifacts/ui-runtime-ab-20260914';fs.mkdirSync(out,{recursive:true});const results=[];
const redact=(_k,v)=>typeof v==='string'?v.replace(/([?&](?:__clerk[^=&#]*|token|nonce|jwt|access_token|id_token|authorization)=)[^&#\s]*/gi,'$1[REDACTED]'):v;
const expected=()=>{try{return fs.statSync('.next/dev/static/chunks/app/layout.js').size;}catch{return null;}};
for(let attempt=1;attempt<=3;attempt++)for(const runtime of [false,true]){
 const browser=await chromium.launch({channel:'chrome',headless:false});
 const record={attempt,runtime,status:null,pageErrors:[],console:[],errors:[],opened:false,closed:false,expectedBefore:expected(),expectedAfter:null,bodyBytes:null,resourceBytes:[]};results.push(record);const pending=[];let body;
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);
  page.on('pageerror',e=>record.pageErrors.push({message:e.message,stack:e.stack}));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))record.console.push({type:m.type(),text:m.text()});});
  if(runtime){const session=await page.context().newCDPSession(page);await session.send('Runtime.enable');}
  page.on('response',r=>{if(r.status()!==200||new URL(r.url()).pathname!=='/_next/static/chunks/app/layout.js')return;pending.push((async()=>{try{body=await r.body();record.bodyBytes=body.length;}catch(e){record.errors.push('body: '+e.message);}})());});
  const r=await page.goto('http://localhost:3032/',{waitUntil:'networkidle',timeout:20000});record.status=r?.status();if(!r?.ok())throw new Error('HTTP '+record.status);
  const button=page.locator('header button[aria-controls="header-tablet-nav"]:visible');
  await button.click();await expect(button).toHaveAttribute('aria-expanded','true',{timeout:5000});await expect(page.locator('#header-tablet-nav a').first()).toBeVisible();record.opened=true;
  await button.click();await expect(button).toHaveAttribute('aria-expanded','false',{timeout:5000});await expect(page.locator('#header-tablet-nav')).toBeHidden();record.closed=true;
  record.resourceBytes=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname==='/_next/static/chunks/app/layout.js').map(r=>r.decodedBodySize));
 }catch(e){record.errors.push(e.message);}finally{await Promise.allSettled(pending);await browser.close();record.expectedAfter=expected();}
 record.failed=!!(record.errors.length||record.pageErrors.length||!record.opened||!record.closed||record.bodyBytes!==record.expectedAfter);
 if(record.failed&&body)fs.writeFileSync(`${out}/${runtime?'runtime':'control'}-${attempt}-layout.js`,body);
 fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,redact,2));console.log(JSON.stringify({...record,console:undefined},redact));
}
if(results.some(r=>r.failed))process.exitCode=1;
