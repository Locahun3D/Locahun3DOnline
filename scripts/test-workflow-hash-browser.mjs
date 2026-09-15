import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdtemp,open,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const large=process.argv.includes('--large');
let fixtureDirectory;

const result=await build({entryPoints:['src/lib/workflow-hash.worker.ts'],bundle:true,platform:'browser',format:'esm',write:false});
const worker=result.outputFiles[0].text;
const client=(await build({entryPoints:['src/lib/workflow-hash-client.ts'],bundle:true,platform:'browser',format:'esm',write:false})).outputFiles[0].text;
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type',req.url?.endsWith('.js')?'text/javascript':'text/html');
 res.end(req.url==='/worker.js'?worker:req.url==='/client.js'?client:'<!doctype html><title>Workflow worker test</title>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 await page.goto('http://127.0.0.1:'+server.address().port);
 if(large){
  fixtureDirectory=await mkdtemp(join(tmpdir(),'workflow-large-hash-'));
  const path=join(fixtureDirectory,'project.zip');
  const file=await open(path,'w');try{await file.truncate(2*1024**3);}finally{await file.close();}
  await page.setContent('<input type="file" id="archive">');
  await page.locator('#archive').setInputFiles(path);
  const started=Date.now();
  const actual=await page.evaluate(async()=>{
   const {runWorkflowHash}=await import('/client.js');let ticks=0;
   const interval=setInterval(()=>ticks++,10);
   try{return {digest:await runWorkflowHash({file:document.querySelector('#archive').files[0]},new AbortController().signal,()=>new Worker('/worker.js',{type:'module'})),ticks};}
   finally{clearInterval(interval);}
  });
  const sha=createHash('sha256'),md5=createHash('md5'),chunk=Buffer.alloc(1024**2);
  for(let i=0;i<2048;i++){sha.update(chunk);md5.update(chunk);}
  assert.deepEqual(actual.digest,{bytes:2*1024**3,sha256:sha.digest('hex'),md5:md5.digest('hex')});
  assert.ok(actual.ticks>0,'2GiB hashing must not block the UI thread');
  console.log(JSON.stringify({test:'2GiB real browser File hashing',milliseconds:Date.now()-started,ticks:actual.ticks,...actual.digest}));
 }
 const result=await page.evaluate(async()=>{
  const {runWorkflowHash}=await import('/client.js');let ticks=0;
  const interval=setInterval(()=>ticks++,1);
  try{
   const result=await runWorkflowHash({file:new File([new Uint8Array(16*1024**2).fill(1)],'project.zip')},new AbortController().signal,()=>new Worker('/worker.js',{type:'module'}));
   return {response:{ok:true,result},ticks};
  }finally{clearInterval(interval);}
 });
 const bytes=Buffer.alloc(16*1024**2,1);
 assert.deepEqual(result.response,{ok:true,result:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),md5:createHash('md5').update(bytes).digest('hex')}});
 assert.ok(result.ticks>0,'Main thread must remain responsive');
 const cancelled=await page.evaluate(async()=>{
  const {runWorkflowHash}=await import('/client.js');const controller=new AbortController();
  const pending=runWorkflowHash({file:new File([new Uint8Array(1024**2)],'project.zip')},controller.signal,()=>new Worker('/worker.js',{type:'module'}));
  controller.abort();try{await pending;return false;}catch(e){return /cancel/i.test(String(e));}
 });
 assert.equal(cancelled,true);
 console.log('Browser worker SHA256/MD5 matches Node; main thread remained responsive.');
}finally{await browser?.close();await new Promise(r=>server.close(r));if(fixtureDirectory)await rm(fixtureDirectory,{recursive:true,force:true});}
