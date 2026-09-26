import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const runtime=createRequire('C:/Users/askgg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const out='F:/Codex/comment-hydration-20260910';fs.mkdirSync(out,{recursive:true});
const component=path.resolve('src/components/property-comments.tsx');
const browser=await runtime('playwright').chromium.launch({channel:'chrome',headless:false});
const props={propertyId:'fixture',comments:[{id:'fixture',userId:'fixture',userName:'確認用',body:'日時表示の検証',createdAt:'2026-07-15T06:41:00Z',parentId:''}],currentUserId:null,isAdmin:false,signedIn:true,canPost:false,locale:'ja'};
process.env.TZ='UTC';
try{
 for(const old of [true,false]){
  const plugins=[{name:'isolated-actions',setup(b){
   b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'stub'}));
   b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'import React from "react"; export default function Link(p){return React.createElement("a",p,p.children)}',resolveDir:process.cwd()}));
   b.onResolve({filter:/^@\/lib\/comment-actions$/},()=>({path:'actions',namespace:'actions'}));
   b.onLoad({filter:/.*/,namespace:'actions'},()=>({contents:['postCommentAction','deleteCommentAction','reportCommentAction','unhideCommentAction','toggleCommentLikeAction'].map(n=>'export const '+n+'=()=>{throw new Error("No writes in fixture")};').join('\n')}));
   if(old)b.onLoad({filter:/property-comments\.tsx$/},()=>({contents:fs.readFileSync(component,'utf8').replace('fmtDateTimeLocaleJST(d, en ? "en-US" : "ja-JP")','d.toLocaleString(en ? "en-US" : "ja-JP", {year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})'),loader:'tsx',resolveDir:path.dirname(component)}));
  }}];
  const prefix=`import React from 'react';import Component from ${JSON.stringify(component)};const element=React.createElement(Component,${JSON.stringify(props)});`;
  const common={bundle:true,write:false,plugins,jsx:'automatic',tsconfig:'tsconfig.json',logLevel:'silent'};
  const server=await build({...common,platform:'node',format:'cjs',stdin:{contents:prefix+"import{renderToString}from'react-dom/server';console.log(renderToString(element));",resolveDir:process.cwd()}});
  const serverPath=path.join(out,old?'old-server.cjs':'fixed-server.cjs');fs.writeFileSync(serverPath,server.outputFiles[0].contents);
  const {execFileSync}=await import('node:child_process');
  const html=execFileSync(process.execPath,[serverPath],{encoding:'utf8',env:{...process.env,TZ:'UTC'}});
  const client=await build({...common,platform:'browser',stdin:{contents:prefix+"import{hydrateRoot}from'react-dom/client';window.errors=[];hydrateRoot(document.getElementById('root'),element,{onRecoverableError:e=>window.errors.push(e.message)});window.started=true;",resolveDir:process.cwd()}});
  const page=await browser.newPage({timezoneId:'Asia/Tokyo',locale:'ja-JP',viewport:{width:820,height:700}});
  await page.setContent('<div id="root">'+html+'</div>');
  await page.addScriptTag({content:client.outputFiles[0].text});
  await page.waitForFunction(()=>window.started);
  await page.waitForTimeout(1500);
  const errors=await page.evaluate(()=>window.errors);
  if(old)assert(errors.some(e=>e.includes('Hydration failed')),'old timezone bug must reproduce');
  else {assert.deepEqual(errors,[]);assert((await page.locator('body').innerText()).includes('2026/07/15 15:41'));await page.screenshot({path:path.join(out,'fixed.png')});}
  console.log(old?'PASS: old component reproduces hydration failure':'PASS: fixed component hydrates without errors');
  await page.close();
 }
}finally{await browser.close();}
