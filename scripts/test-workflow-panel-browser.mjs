import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {chromium} from 'playwright';

const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {WorkflowTransferPanel} from './src/components/admin/workflow-transfer';createRoot(document.getElementById('app')).render(<WorkflowTransferPanel actorId="admin-fixture" storageOrigin="https://storage.fixture.test" destinations={[{id:'fixture-property',title:'検証用スタジオ',scenes:[{id:'fixture-scene',label:'検証用シーン'}]}]} session={async()=>({actorId:'admin-fixture',token:'fixture-only'})}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',platform:'browser',jsx:'automatic',write:false,plugins:[{name:'fixture-clerk',setup(b){b.onResolve({filter:/^@clerk\/nextjs$/},()=>({path:'clerk',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useClerk(){throw Error("Fixture must use injected session")}'}));}}]});
const worker=(await build({entryPoints:['src/lib/workflow-hash.worker.ts'],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;
const css=(await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css;
const bytes=Buffer.from('isolated-workflow-fixture');const sha=createHash('sha256').update(bytes).digest('hex'),md5=createHash('md5').update(bytes).digest('base64'),key='b'.repeat(64);
const receipt={schema:1,roundtripVerified:true,input:{revision:1,projectSha256:'a'.repeat(64)},archive:{bytes:bytes.length,sha256:sha}};
const browser=await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir('artifacts/workflow-panel',{recursive:true});
try{
 for(const width of [1440,820,390]){
  const context=await browser.newContext({viewport:{width,height:900}});let puts=0,attachments=0,targets=0,stored=false,corrupt=false,corsFailure=false,slow=false;
  const exceptions=[];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   const cors={'access-control-allow-origin':'https://workflow.fixture.test','access-control-allow-methods':'PUT,GET,OPTIONS','access-control-allow-headers':'content-md5,if-none-match'};
   if(url.origin==='https://storage.fixture.test'){
    assert.equal(req.headers().authorization,undefined);
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    if(req.method()==='PUT'){puts++;assert.deepEqual(req.postDataBuffer(),bytes);stored=true;return route.fulfill({status:200,headers:cors});}
    return route.fulfill({status:200,headers:corsFailure?{'access-control-allow-origin':'https://wrong.fixture.test'}:cors,body:corrupt?Buffer.alloc(bytes.length):bytes});
   }
   if(url.origin!=='https://workflow.fixture.test')return route.abort();
   if(url.pathname==='/worker-placeholder')return route.abort();
   if(url.pathname==='/workflow-hash.worker.ts')return route.fulfill({contentType:'text/javascript',body:worker});
   if(url.pathname==='/app.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
   if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css});
   if(url.pathname==='/api/admin/workflow'){
    assert.equal(req.headers().authorization,'Bearer fixture-only');const body=req.postDataJSON();
    if(body.action==='target'){targets++;return route.fulfill({json:{propertyId:'fixture-property',sceneId:'fixture-scene',expectedUpdatedAt:'2026-09-14T00:00:00.000Z',previousUrl:''}});}
    if(body.action==='reserve')return route.fulfill({json:{key,id:'wf_'+key,status:stored?'ready':'uploading',putUrl:'https://storage.fixture.test/object',headers:{'Content-MD5':md5,'If-None-Match':'*'}}});
    if(body.action==='verify'){if(slow)await new Promise(r=>setTimeout(r,500));return route.fulfill({json:{bytes:bytes.length,sha256:sha,downloadUrl:'https://storage.fixture.test/object'}}).catch(()=>{});}
    attachments++;return route.fulfill({json:{status:'attached',key,propertyId:'fixture-property',sceneId:'fixture-scene'}});
   }
   return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><main class="theme-online ui-page-shell px-4 sm:px-8 pb-8"><div class="ui-page-header"><h1 class="ui-page-title">下書きデータ転送</h1></div><div id="app"></div></main><script type="module" src="/app.js"></script>'});
  });
  const page=await context.newPage();page.on('pageerror',e=>exceptions.push(e.message));await page.goto('https://workflow.fixture.test');
  await page.waitForTimeout(500);assert.deepEqual(exceptions,[]);
  await page.getByRole('combobox').nth(0).selectOption('fixture-property');await page.getByRole('combobox').nth(1).selectOption('fixture-scene');
  await page.getByLabel('書き出しデータ（project.zip）').setInputFiles({name:'project.zip',mimeType:'application/zip',buffer:bytes});
  await page.getByLabel('検証情報（receipt.json）').setInputFiles({name:'receipt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
  await page.getByRole('button',{name:'下書きへ転送'}).click();await page.getByRole('status').filter({hasText:'下書きへの登録完了'}).waitFor({timeout:15000});
  await page.getByRole('button',{name:'下書きへ転送'}).click();await page.getByRole('status').filter({hasText:'下書きへの登録完了'}).waitFor();
  assert.equal(puts,1);assert.equal(targets,1);assert.equal(attachments,2);
  await page.screenshot({path:`artifacts/workflow-panel/${width}-success.png`,fullPage:true});
  corrupt=true;await page.getByRole('button',{name:'下書きへ転送'}).click();await page.getByRole('alert').waitFor();assert.equal(attachments,2);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  await page.screenshot({path:`artifacts/workflow-panel/${width}-error.png`,fullPage:true});assert.deepEqual(exceptions,[]);
  corrupt=false;corsFailure=true;await page.getByRole('button',{name:'下書きへ転送'}).click();await page.getByRole('alert').waitFor();assert.equal(attachments,2);
  corsFailure=false;slow=true;await page.getByRole('button',{name:'下書きへ転送'}).click();await page.getByRole('button',{name:'中止',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'転送を中止しました'}).waitFor();await page.waitForTimeout(650);assert.equal(attachments,2);
  await context.close();
 }
 console.log('Panel: three widths, actual worker, upload/retry/readback and corrupt download rejection passed.');
}finally{await browser.close();}
