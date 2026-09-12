import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const out = 'F:/Codex/catalog-sales-20260912';
fs.mkdirSync(out, { recursive:true });
const records = [
  {id:'paid',status:'completed',priceYen:5000,propertyId:'a',propertyTitle:'完了した販売',userEmail:'paid@example.test',itemLabel:'標準',createdAt:'2026-09-12T01:00:00Z',stripeSessionId:'fixture'},
  {id:'waiting',status:'pending',priceYen:200000,propertyId:'a',propertyTitle:'未決済の販売',userEmail:'waiting@example.test',itemLabel:'拡張',createdAt:'2026-09-12T01:00:00Z',stripeSessionId:'fixture'},
];
const substitutes = {
  '@/lib/dal': 'export const requireAdmin=async()=>({id:"fixture-admin"});',
  '@/lib/purchases': `export const purchaseRepo={list:async()=>${JSON.stringify(records)}};`,
  '@/lib/store': 'export const repo={list:async()=>[{id:"a",title:"検証用スタジオ",splatItems:[]}]};',
  '@/lib/admin-actions': 'export const refundPurchaseAction=()=>{throw Error("No writes")};export const deletePurchaseAction=refundPurchaseAction;export const bulkDeleteTestPurchasesAction=refundPurchaseAction;',
  '@/lib/stripe': 'export const stripeConfigStatus=()=>({enabled:true,live:true});',
  'next/link': 'import React from "react";export default function Link(p){return <a {...p}/>}',
};
const bundle = await build({bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',logLevel:'silent',plugins:[{name:'isolated-admin-data',setup(b){
  b.onResolve({filter:/.*/},args=>Object.hasOwn(substitutes,args.path)?{path:args.path,namespace:'fixture'}:undefined);
  b.onResolve({filter:/^@\/components\/admin\/(stripe-setup-panel|refund-button|delete-purchase-button|bulk-delete-test-button)$/},args=>({path:args.path,namespace:'empty'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:substitutes[args.path],loader:'tsx',resolveDir:process.cwd()}));
  b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'export default function ExternalControl(){return null}',loader:'tsx'}));
}}],stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/app/admin/purchases/page';const root=createRoot(document.getElementById('fixture'));async function render(params={}){root.render(await Page({searchParams:Promise.resolve(params)}));}document.addEventListener('submit',e=>{e.preventDefault();render(Object.fromEntries(new FormData(e.target)));});render();`}});
const browser = await chromium.launch({channel:'chrome',headless:false});
try {
 for(const width of [1440,820,390]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.goto('http://localhost:3032/properties',{waitUntil:'domcontentloaded'});
  await page.locator('[data-property-grid]').waitFor();
  if(width<720)await page.getByRole('button',{name:/絞り込み検索/}).click();
  await page.waitForTimeout(1000);
  const hours=await page.getByLabel('終了時刻',{exact:true}).boundingBox();
  const recent=await page.getByText('最近の条件',{exact:true}).boundingBox();
  console.log({width,hours,recent});
  await page.screenshot({path:out+'/catalog-'+width+'.png'});
  assert(recent.y>=hours.y-3,'recent must not take a row above keyword');
  if(width>=720)assert(Math.abs(recent.y-hours.y)<12 && recent.x>hours.x,'recent stays to the right of hours');
  await page.screenshot({path:out+'/catalog-'+width+'.png'});
  const keyword=page.getByPlaceholder('白ホリ / 渋谷 / ガレージ ...');
  await keyword.fill((await page.locator('[data-property-grid] h3').first().innerText()).slice(0,8));
  await page.waitForTimeout(600);
  const cards=page.locator('[data-property-grid] > li');
  assert(await cards.count()>0,'real catalog fixture must have a matching result');
  for(const card of await cards.all()){assert((await card.boundingBox()).width<=321,'card width remains bounded for a few matches');}
  await page.screenshot({path:out+'/catalog-filtered-'+width+'.png'});
  const links=await page.locator('link[rel="stylesheet"]').evaluateAll(els=>els.map(el=>el.href));
  const css=(await Promise.all(links.map(async url=>(await page.request.get(url)).text()))).join('\n');
  await page.goto('about:blank');
  await page.setContent('<html><head><style>'+css+'</style></head><body><div class="theme-online" id="fixture"></div></body></html>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole('heading',{name:'購入履歴',exact:true}).waitFor();
  assert.equal(await page.getByText('未決済の販売',{exact:false}).count(),0);
  assert.equal(await page.getByText('¥200,000',{exact:true}).count(),0);
  assert(await page.getByText('¥5,000',{exact:true}).count()>0);
  await page.screenshot({path:out+'/sales-default-'+width+'.png'});
  await page.getByLabel('処理中を表示',{exact:true}).check();
  await page.getByText('未決済の販売',{exact:false}).waitFor();
  assert.equal(await page.getByText('¥200,000',{exact:true}).count(),1,'pending appears only in history, not summary');
  await page.screenshot({path:out+'/sales-pending-'+width+'.png'});
  await page.getByLabel('処理中を表示',{exact:true}).uncheck();
  await page.getByText('未決済の販売',{exact:false}).waitFor({state:'detached'});
  await page.goto('http://localhost:3032/pricing',{waitUntil:'domcontentloaded'});
  await page.getByText('Free',{exact:true}).first().waitFor();
  assert.equal(await page.getByText(/3DGS ウォークスルーは/).count(),0);
  assert.equal(await page.getByText(/決済連携は準備中/).count(),0);
  await page.screenshot({path:out+'/pricing-'+width+'.png'});
  console.log('PASS catalog and actual admin page fixture',width);
  await page.close();
 }
}finally{await browser.close();}
