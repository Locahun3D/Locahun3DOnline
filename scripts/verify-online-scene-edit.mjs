// Real renderer / project archive roundtrip; storage is an isolated local fixture.
// This does not authenticate against or write to production.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {build} from 'esbuild';

const viewer = process.env.SCENE_EDITOR_HTML || path.resolve('public/viewer/scene-editor.html');
const scan = process.env.SCENE_EDIT_FIXTURE || 'F:/Codex/locahun-walk/fixtures/real-scan.splat';
const out = path.resolve('artifacts/online-scene-edit');
const normalizedLayers=layers=>JSON.parse(JSON.stringify(layers)).map(layer=>({...layer,eventImage:layer.eventImage?createHash('sha256').update(layer.eventImage).digest('hex'):null}));
await fs.mkdir(out,{recursive:true});
const original = await fs.readFile(scan), originalHash=createHash('sha256').update(original).digest('hex');
let saved=null;
const clientMode=process.env.SCENE_EDIT_CLIENT==='1';
let uploaded=null,digest=null,attached=0,failUpload=false;
let bundle,worker,clientCss;
if(clientMode){
 const result=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import SceneEditor from './src/components/admin/scene-editor';createRoot(document.getElementById('app')).render(<SceneEditor propertyId='fixture' sceneId='scene' label='検証用スキャン' published={true}/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'fixture',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},tsconfig:'tsconfig.json'});
 bundle=result.outputFiles.find(f=>f.path.endsWith('.js')).text;clientCss=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
 worker=(await build({entryPoints:['src/lib/workflow-hash.worker.ts'],bundle:true,write:false,format:'esm'})).outputFiles[0].text;
}
const target=()=>({propertyId:'fixture',sceneId:'scene',expectedUpdatedAt:new Date(1700000000000+attached*1000).toISOString(),previousUrl:attached?'/api/r2/assets/splat/edited.zip':'/api/r2/assets/splat/source.splat',propertyRevision:'c'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString(),sessionKey:(attached?'b':'a').repeat(64),status:'published'});
const hook=`
window.__sceneReview={
 select:id=>{if(selectedLayerId!==id)selectLayer(id);else renderTransformPanel();},
 inspect:()=>layers.map(L=>({id:L.id,type:L.type,name:L.name,pos:{...L.pos},rot:{...L.rot},scale:{...L.scale},pathPoints:L.pathPoints,pathLabel:L.pathLabel,pathWidth:L.pathWidth,eventImage:L.eventImage,eventImageName:L.eventImageName})),
 addPath:()=>{const x=camPos.x,y=camPos.y-1,z=camPos.z-2;_pathPts=[new THREE.Vector3(x-1,y,z-1),new THREE.Vector3(x+1,y,z-1),new THREE.Vector3(x+1,y,z+1),new THREE.Vector3(x-1,y,z+1)];_finalizePath();return layers.findLast(L=>L.type==='path').id;},
 addEvent:()=>{addEventLayer();return layers.findLast(L=>L.type==='event').id;},
};
`;
let html=await fs.readFile(viewer,'utf8');
const at=html.lastIndexOf('</script>');assert.ok(at>0,'viewer script exists');
html=html.slice(0,at)+hook+html.slice(at);
const shell=`<!doctype html><html lang="ja"><meta charset="utf-8"><style>body{margin:0;background:#f5f8fa;color:#132d40;font:16px sans-serif}header{padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}button{min-height:44px;padding:8px 18px}iframe{border:0;width:100%;height:calc(100dvh - 100px)}#status{overflow-wrap:anywhere}</style><header><strong>3DGS編集・保存検証</strong><button id="save" disabled>保存</button><button id="reopen">保存したシーンを開く</button><span id="status">読込中</span></header><iframe id="viewer" src="/viewer/scene-editor.html?onlineSceneEdit=1"></iframe><script>
let counter=0,mode='original',active='',saveRequest='';window.review={ready:false,saved:false,error:null};
const frame=document.getElementById('viewer'),status=document.getElementById('status'),save=document.getElementById('save');
window.addEventListener('message',async e=>{
 if(e.origin!==location.origin||e.source!==frame.contentWindow)return;const m=e.data;
 if(m.type==='locahun:scene-editor-ready'){active='load-'+(++counter);frame.contentWindow.postMessage({type:'locahun:scene-load',requestId:active,sourceUrl:'/api/scene-edit/source?sessionKey='+ (mode==='original'?'a':'b').repeat(64),fileName:mode==='original'?'real-scan.splat':'edited-project.zip'},location.origin);}
 if(m.type==='locahun:scene-ready'&&m.requestId===active){review.ready=true;save.disabled=false;status.textContent='編集できます';}
 if(m.type==='locahun:scene-load-error'||m.type==='locahun:scene-export-error'){review.error=m.code;status.textContent='エラー: '+m.code;}
 if(m.type==='locahun:scene-exported'&&m.requestId===saveRequest){const r=await fetch('/fixture-save',{method:'POST',body:m.archive});if(!r.ok)throw Error('fixture save failed');frame.contentWindow.postMessage({type:'locahun:scene-saved',requestId:saveRequest},location.origin);review.saved=true;status.textContent='保存済み';save.disabled=false;}
});
save.onclick=()=>{save.disabled=true;saveRequest='save-'+(++counter);frame.contentWindow.postMessage({type:'locahun:scene-export',requestId:saveRequest},location.origin);};
document.getElementById('reopen').onclick=()=>{mode='saved';review.ready=false;review.error=null;frame.src='/viewer/scene-editor.html?onlineSceneEdit=1&r='+(++counter);};
</script></html>`;
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(clientMode?`<!doctype html><html lang="ja"><meta charset="utf-8"><style>body{margin:0;font:14px Arial,sans-serif;--header-h:0px;--color-bg:#f5f8fa;--color-ink:#132d40;--color-accent:#1da5c3}*{box-sizing:border-box}button{font:inherit}a{color:inherit}</style><link rel="stylesheet" href="/client.css"><div id="app"></div><script type="module" src="/client.js"></script></html>`:shell);return;}
  if(u.pathname==='/client.js'||u.pathname==='/workflow-hash.worker.ts'){res.setHeader('Content-Type','application/javascript');res.end(u.pathname==='/client.js'?bundle:worker);return;}
  if(u.pathname==='/client.css'){res.setHeader('Content-Type','text/css');res.end(clientCss);return;}
  if(u.pathname==='/api/scene-edit'&&req.method==='POST'){
   const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));res.setHeader('Content-Type','application/json');
   if(body.action==='target')res.end(JSON.stringify({target:target(),sourceUrl:'/api/scene-edit/source?sessionKey='+target().sessionKey,fileName:attached?'edited.zip':'source.splat',storageOrigin:'https://scene-storage.invalid'}));
   else if(body.action==='reserve'){digest=body.digest;res.end(JSON.stringify({key:'d'.repeat(64),status:'uploading',putUrl:'https://scene-storage.invalid/archive.zip',headers:{'Content-MD5':Buffer.from(digest.archiveMd5,'hex').toString('base64'),'If-None-Match':'*'}}));}
   else if(body.action==='verify'){assert.equal(createHash('sha256').update(uploaded).digest('hex'),digest.archiveSha256);res.end(JSON.stringify({key:'d'.repeat(64),bytes:uploaded.length,sha256:digest.archiveSha256,downloadUrl:'https://scene-storage.invalid/archive.zip'}));}
   else if(body.action==='attach'){saved=uploaded;attached++;res.end(JSON.stringify({status:'attached',key:'d'.repeat(64),propertyId:'fixture',sceneId:'scene',url:target().previousUrl,updatedAt:target().expectedUpdatedAt}));}
   else{res.writeHead(400);res.end('{}');}return;
  }
  if(u.pathname==='/viewer/scene-editor.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(u.pathname==='/api/scene-edit/source'){
   const bytes=u.searchParams.get('sessionKey')==='a'.repeat(64)?original:saved;
   if(!bytes){res.writeHead(404);res.end();return;}
   res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',bytes.length);res.end(bytes);return;
  }
  if(u.pathname==='/fixture-save'&&req.method==='POST'){
   const chunks=[];for await(const c of req)chunks.push(c);saved=Buffer.concat(chunks);
   await fs.writeFile(path.join(out,'edited-project.zip'),saved);res.end('ok');return;
  }
  if(u.pathname.startsWith('/viewer/')){
   const file=path.resolve('public', '.'+u.pathname);const root=path.resolve('public/viewer');
   if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   const bytes=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(bytes);return;
  }
  res.writeHead(404);res.end();
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results=[];
await page.context().route('https://scene-storage.invalid/**',async route=>{
 const request=route.request();const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET, PUT, OPTIONS','access-control-allow-headers':'content-md5, if-none-match'};
 if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
 if(request.method()==='PUT'){if(failUpload){await route.fulfill({status:500,headers});return;}uploaded=request.postDataBuffer();await route.fulfill({status:200,headers,body:''});return;}
 await route.fulfill({status:200,headers,body:uploaded});
});
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
const waitReady=async()=>{if(clientMode){await page.getByRole('button',{name:'このシーンに保存',exact:true}).waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent==='このシーンに保存')?.disabled,null,{timeout:120000});return;}await page.waitForFunction(()=>review.ready||review.error,null,{timeout:120000});assert.equal(await page.evaluate(()=>review.error),null);};
try{
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await waitReady();
 let frame=page.frames().find(f=>f.url().includes('/viewer/scene-editor.html'));
 await frame.locator('#dz').waitFor({state:'hidden'});
 assert.ok((await frame.evaluate(()=>__sceneReview.inspect())).some(l=>l.type==='splat'));
 const pathId=await frame.evaluate(()=>__sceneReview.addPath());
 await frame.evaluate(id=>{setPathLabel(id,'撮影エリア');setPathWidth(id,.12);},pathId);
 if(await frame.locator('#layer-panel').evaluate(e=>e.classList.contains('collapsed')))await frame.locator('#lp-title-head').click();
 await frame.locator('#lt-px').fill('1.25');await frame.locator('#lt-px').dispatchEvent('input');
 await frame.locator('#lt-ry').fill('15');await frame.locator('#lt-ry').dispatchEvent('input');
 const eventId=await frame.evaluate(()=>__sceneReview.addEvent());
 const chooserPromise=page.waitForEvent('filechooser');await frame.evaluate(id=>importEventImage(id),eventId);
 const chooser=await chooserPromise;await chooser.setFiles(path.resolve('public/og-cover.jpg'));
 await frame.waitForFunction(id=>__sceneReview.inspect().find(l=>l.id===id)?.eventImageName==='og-cover.jpg',eventId);
 const expected=await frame.evaluate(()=>__sceneReview.inspect());
 assert.equal(expected.find(l=>l.id===pathId).pos.x,1.25);assert.equal(expected.find(l=>l.id===pathId).rot.y,15);
 await page.screenshot({path:path.join(out,'before-save-1440.png')});
 if(clientMode){
  failUpload=true;await page.getByRole('button',{name:'このシーンに保存',exact:true}).click();await page.getByRole('status').filter({hasText:'保存できませんでした'}).waitFor({timeout:120000});assert.equal(attached,0,'failed upload must not attach');
  failUpload=false;await page.getByRole('button',{name:'このシーンに保存',exact:true}).click();await page.getByRole('status').filter({hasText:/^保存しました$/}).waitFor({timeout:120000});assert.equal(attached,1);
  await page.getByRole('button',{name:'このシーンに保存',exact:true}).click();await page.getByRole('status').filter({hasText:/^保存しました$/}).waitFor({timeout:120000});assert.equal(attached,2,'second save uses fresh session');
  await page.reload();
 }else{
  await page.locator('#save').click();await page.waitForFunction(()=>review.saved||review.error,null,{timeout:120000});assert.equal(await page.evaluate(()=>review.error),null);await page.locator('#reopen').click();
 }
 assert.ok(saved?.length>original.length);await waitReady();frame=page.frames().find(f=>f.url().includes('/viewer/scene-editor.html'));
 await frame.locator('#dz').waitFor({state:'hidden'});
 const actual=await frame.evaluate(()=>__sceneReview.inspect());assert.deepEqual(normalizedLayers(actual),normalizedLayers(expected),'all editable layer fields survive fresh iframe restore');
 for(const width of [1440,820,390]){
  await page.setViewportSize({width,height:1000});await frame.evaluate(id=>__sceneReview.select(id),eventId);
  if(await frame.locator('#layer-panel').evaluate(e=>e.classList.contains('collapsed')))await frame.locator('#lp-title-head').click();
  await page.screenshot({path:path.join(out,`${clientMode?'client-':''}reopened-${width}.png`)});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  results.push({width,overflow,layers:actual.length});
 }
 assert.equal(createHash('sha256').update(await fs.readFile(scan)).digest('hex'),originalHash);
 assert.deepEqual(errors,[],'no renderer/runtime errors');
 await fs.writeFile(path.join(out,clientMode?'client-roundtrip.json':'roundtrip.json'),JSON.stringify({results,originalHash,archiveBytes:saved.length,attached,errors},null,2));
 console.log('PASS real SPLAT + path + move + rotate + uploaded image → ZIP → new viewer restoration',results);
}catch(error){await page.screenshot({path:path.join(out,'failure.png')});console.error('Browser errors',errors);throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
