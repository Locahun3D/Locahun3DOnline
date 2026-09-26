import {chromium,expect} from 'playwright/test';
import fs from 'node:fs';
const out=process.env.QA_OUT||'artifacts/ui-body-capture-ab-20260914';fs.mkdirSync(out,{recursive:true});
const results=[];
const redact=(_key,v)=>typeof v==='string'?v.replace(/([?&](?:__clerk[^=&#]*|token|nonce|jwt|access_token|id_token|authorization)=)[^&#\s]*/gi,'$1[REDACTED]'):v;
const expected=()=>{try{const s=fs.statSync('.next/dev/static/chunks/app/layout.js');return {bytes:s.size,mtimeMs:s.mtimeMs};}catch{return null;}};
// Identical browser lifetime, readiness, interactions and passive logs in both arms.
// Only B attaches a response listener and obtains JS response bodies. No CDP or routing.
for(let attempt=1;attempt<=3;attempt++)for(const arm of ['A','B']){
 const browser=await chromium.launch({channel:'chrome',headless:false});
 const record={arm,attempt,expectedBefore:expected(),expectedAfter:null,status:null,url:null,pageErrors:[],console:[],errors:[],opened:false,closed:false,resources:[],bodies:[]};
 results.push(record);const pending=[];let layoutBody;
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);
  page.on('pageerror',e=>record.pageErrors.push({message:e.message,stack:e.stack}));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))record.console.push({type:m.type(),text:m.text()});});
  if(arm==='B')page.on('response',response=>{
   if(response.request().resourceType()!=='script')return;
   pending.push((async()=>{try{const body=await response.body();record.bodies.push({url:response.url(),status:response.status(),bytes:body.length,contentType:response.headers()['content-type']});if(new URL(response.url()).pathname==='/_next/static/chunks/app/layout.js')layoutBody=body;}catch(e){record.errors.push('response.body: '+e.message);}})());
  });
  const response=await page.goto('http://localhost:3032/',{waitUntil:'networkidle',timeout:20000});
  record.status=response?.status();record.url=page.url();if(!response?.ok())throw new Error('HTTP '+record.status);
  const button=page.locator('header button[aria-controls="header-tablet-nav"]:visible');
  await button.click();await expect(button).toHaveAttribute('aria-expanded','true',{timeout:5000});await expect(page.locator('#header-tablet-nav a').first()).toBeVisible();record.opened=true;
  await button.click();await expect(button).toHaveAttribute('aria-expanded','false',{timeout:5000});await expect(page.locator('#header-tablet-nav')).toBeHidden();record.closed=true;
  record.resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname==='/_next/static/chunks/app/layout.js').map(r=>({url:r.name,decodedBodySize:r.decodedBodySize,encodedBodySize:r.encodedBodySize,transferSize:r.transferSize})));
 }catch(e){record.errors.push(e.message);}finally{
  // Navigation networkidle normally means all response bodies have finished.
  await Promise.race([Promise.allSettled(pending),new Promise(resolve=>{const t=setTimeout(resolve,5000);t.unref();})]);
  await browser.close();record.expectedAfter=expected();
 }
 record.failed=!!(record.errors.length||record.pageErrors.length||!record.opened||!record.closed);
 if(layoutBody&&(record.failed||layoutBody.length!==record.expectedAfter?.bytes)){record.layoutEvidence=`${out}/${arm}-${attempt}-layout.js`;fs.writeFileSync(record.layoutEvidence,layoutBody);}
 fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,redact,2));
 console.log(JSON.stringify({arm,attempt,status:record.status,expected:record.expectedAfter?.bytes,bodyBytes:record.bodies.find(x=>new URL(x.url).pathname==='/_next/static/chunks/app/layout.js')?.bytes,resourceBytes:record.resources.map(x=>x.decodedBodySize),opened:record.opened,closed:record.closed,pageErrors:record.pageErrors,errors:record.errors},redact));
}
if(results.some(r=>r.failed))process.exitCode=1;
