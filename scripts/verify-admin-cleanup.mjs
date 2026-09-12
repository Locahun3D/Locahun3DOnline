import fs from 'node:fs';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out = 'F:/Codex/admin-cleanup-20260912';
fs.mkdirSync(out, { recursive: true });
const assets = [{id:'unused',url:'/unused.jpg',filename:'unused.jpg',label:'未使用の画像',kind:'image',status:'ready',size:1000,createdAt:'2026-09-12T00:00:00Z'}, {id:'used',url:'/used.jpg',filename:'used.jpg',label:'使用中の画像',kind:'image',status:'ready',size:1000,createdAt:'2026-09-12T00:00:00Z'}];
const records = [{id:'active',status:'new',name:'テスト',email:'fixture@example.invalid',message:'受信箱の問い合わせ',purpose:'撮影',createdAt:'2026-09-12T00:00:00Z',propertyTitle:'テスト物件'}, {id:'archived',status:'archived',name:'テスト',email:'fixture@example.invalid',message:'アーカイブの問い合わせ',purpose:'撮影',createdAt:'2026-09-12T00:00:00Z',propertyTitle:'テスト物件'}];
const stubs = {
  '@/lib/dal': 'export async function requireAdmin(){}',
  '@/lib/inquiries': `export const inquiryRepo={list:async()=>${JSON.stringify(records)}};`,
  '@/lib/admin-actions': 'export async function setInquiryStatusAction(){};export async function deleteInquiryAction(){};export async function replyToInquiryAction(){};',
  'next/link': 'import React from "react";export default function Link(props){return React.createElement("a",props)}',
};
const result=await build({bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',plugins:[{name:'isolated-services',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'js',resolveDir:process.cwd()}));}}],stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from 'react';import{createRoot}from'react-dom/client';import AssetLibrary from './src/components/admin/asset-library';import Inquiries from './src/app/admin/inquiries/page';const root=createRoot(document.getElementById('fixture'));window.showAssets=()=>root.render(<AssetLibrary initialAssets={${JSON.stringify(assets)}} usage={{'/used.jpg':['p']}} properties={[{id:'p',title:'テスト物件',cover:''}]}/>);window.showInquiries=async(box)=>root.render(await Inquiries({searchParams:Promise.resolve({box})}));`}});
const browser=await chromium.launch({channel:'chrome',headless:false});
try { for(const width of [1440,820,390]){
 const page=await browser.newPage({viewport:{width,height:950}});
 await page.goto('http://localhost:3032',{waitUntil:'domcontentloaded'});
 const cssLinks=await page.locator('link[rel="stylesheet"]').evaluateAll(ls=>ls.map(l=>l.href));
 const css=(await Promise.all(cssLinks.map(async url=>(await page.request.get(url)).text()))).join('\n');
 await page.setContent(`<style>${css}</style><div class="theme-online p-4 min-h-screen" id="fixture"></div>`);
 const deleted=[];
 await page.route('**/api/admin/assets/update',async route=>{deleted.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}})});
 await page.addScriptTag({content:result.outputFiles[0].text});
 await page.evaluate(()=>window.showAssets());
 const deletion=page.getByRole('button',{name:'未使用アセットを削除（1件）',exact:true});
 await deletion.waitFor();
 await page.screenshot({path:`${out}/assets-${width}.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.getBoundingClientRect().width>innerWidth+1),false);
 page.once('dialog',dialog=>dialog.dismiss());await deletion.click();assert.equal(deleted.length,0);
 page.once('dialog',dialog=>dialog.accept());await deletion.click();
 await page.getByRole('button',{name:'未使用アセットを削除（0件）',exact:true}).waitFor();
 assert.deepEqual(deleted,[{action:'delete',id:'unused',unusedOnly:true}]);
 assert.equal(await page.getByRole('button',{name:'未使用アセットを削除（0件）',exact:true}).isDisabled(),true);
 for(const box of [undefined,'archive']){
  await page.evaluate(box=>window.showInquiries(box),box);
  await page.getByRole('heading',{name:/問い合わせ/}).waitFor();
  assert.equal(await page.locator('#active').count(),box?0:1);
  assert.equal(await page.locator('#archived').count(),box?1:0);
  if(box) {assert.equal(await page.getByRole('button',{name:'既読にする',exact:true}).count(),0);await page.getByRole('button',{name:'受信箱に戻す'}).waitFor();}
  assert.equal(await page.evaluate(()=>document.documentElement.getBoundingClientRect().width>innerWidth+1),false);
  await page.screenshot({path:`${out}/${box||'inbox'}-${width}.png`});
 }
 await page.close();
} console.log('PASS assets deletion cancel/unused-only/disabled + inbox/archive at 1440/820/390; production data untouched');}finally{await browser.close();}
