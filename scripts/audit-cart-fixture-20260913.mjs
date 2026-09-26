import fs from 'node:fs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const out=process.env.OUT_DIR||'artifacts/cart-fixture-audit-20260913';fs.mkdirSync(out,{recursive:true});
const bundle=await build({bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"'},stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/app/cart/page';createRoot(document.getElementById('root')).render(<main>{await Page()}</main>);`},plugins:[{name:'safe-boundaries',setup(b){
 b.onResolve({filter:/^(next\/link|@\/lib\/cart|@\/lib\/i18n\/server|@\/components\/locale-provider)$/},a=>({path:a.path,namespace:'safe'}));
 b.onLoad({filter:/.*/,namespace:'safe'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/link'?'export default function Link({children,...props}){return <a {...props}>{children}</a>}':a.path.endsWith('/cart')?'export const getCart=()=>window.items;export const onCartChange=()=>()=>{};export const reconcileCart=()=>({changed:false,removed:[],priceChanged:[]});export const removeFromCart=()=>{};export const clearCart=()=>{};export const restoreRemovedCartItem=()=>{};':a.path.endsWith('/server')?'export const getLocale=async()=>window.locale;':'export const useLocale=()=>window.locale;export const useHref=()=>p=>(window.locale==="en"?"/en":"")+p;'}));
}}]});
const browser=await chromium.launch({channel:'chrome',headless:false});const results=[];
try{
 const page=await browser.newPage();await page.goto((process.env.BASE_URL||'http://localhost:3032')+'/contact',{waitUntil:'domcontentloaded'});
 const links=await page.locator('link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.href));
 const css=(await Promise.all(links.map(async u=>(await page.request.get(u)).text()))).join('\n');
 for(const locale of ['ja','en'])for(const width of [320,360,390,414,820,1440]){
  await page.goto('about:blank');await page.setViewportSize({width,height:width<500?844:900});
  await page.setContent(`<!doctype html><html lang="${locale}"><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.evaluate(locale=>{window.locale=locale;window.items=[0,1].map(index=>({propertyId:'fixture-only',splatItemIndex:index,title:locale==='en'?'Yokohama Industrial Warehouse — a spacious first-floor location with detailed architectural textures':'横浜インダストリアル倉庫｜重厚な質感を残した広い撮影空間と長い物件タイトル',label:index?'2F スタジオ / Second floor studio':'1F / First floor',price:150000,license:index?'extended':'standard',viewerHref:'/private-untrusted-local-snapshot'}));window.fetch=async url=>{if(url!=='/api/cart/prices')throw Error('No API writes allowed');return{ok:true,json:async()=>({items:window.items.map(i=>({...i,available:true,viewerHref:i.splatItemIndex===0?'/properties/fixture-only?scene=first#walkthrough':null,purchaseContents:[{format:'3DGS RAD',sizeMb:356,kind:'file'},{format:'PLY',sizeMb:1240,kind:'version',date:'2026-09-12'}]}))})}};},locale);
  await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});await page.getByRole('region',{name:locale==='en'?'Cart item':'カートの商品',exact:true}).first().waitFor();
  await page.getByText('356 MB',{exact:false}).first().waitFor();
  const viewerLinks=await page.locator('[data-cart-viewer-link]').evaluateAll(ns=>ns.map(n=>({href:n.getAttribute('href'),text:n.textContent,height:n.getBoundingClientRect().height})));
  if(viewerLinks.length!==1)throw Error('Exactly the server-authorized item should have a 3DGS link; got '+viewerLinks.length);
  if(viewerLinks[0].href!==(locale==='en'?'/en':'')+'/properties/fixture-only?scene=first#walkthrough')throw Error('3DGS link does not preserve locale and scene');
  if(viewerLinks[0].height<43)throw Error('3DGS link touch target below 44px');
  if(await page.locator('a[href*="private-untrusted"]').count())throw Error('Untrusted stored link exposed');
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,rects:[...document.querySelectorAll('[data-cart-identifier],[data-cart-details]')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})}));
  const wordChecks=await page.evaluate(locale=>{
   const checks=[];
   for(const el of document.querySelectorAll('[data-cart-details] > p:first-of-type')){
    const chars=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){const n=walker.currentNode;for(let i=0;i<n.textContent.length;i++){const range=document.createRange();range.setStart(n,i);range.setEnd(n,i+1);chars.push({char:n.textContent[i],y:Math.round(range.getBoundingClientRect().y)});}}
    const text=chars.map(c=>c.char).join('');
    const words=locale==='ja'?['同梱','再配布','テンプレート']:[...new Set(text.match(/[A-Za-z]{2,}/g)||[])];
    for(const word of words){let start=text.indexOf(word);while(start!==-1){const rows=[...new Set(chars.slice(start,start+word.length).map(c=>c.y))];checks.push({word,rows,split:rows.length>1});start=text.indexOf(word,start+word.length);}}
   }
   return checks;
  },locale);
  if(locale==='ja'&&['同梱','再配布','テンプレート'].some(word=>!wordChecks.some(c=>c.word===word)))throw Error('Required license word missing from fixture');
  await page.screenshot({path:`${out}/${locale}-${width}-full.png`,fullPage:true});await page.screenshot({path:`${out}/${locale}-${width}-initial.png`});results.push({locale,width,...geometry,wordChecks});
 }
}finally{await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify({cases:results.length,failures:results.filter(r=>r.overflow||r.wordChecks.some(w=>w.split)).map(r=>({locale:r.locale,width:r.width,overflow:r.overflow,splitWords:r.wordChecks.filter(w=>w.split)}))},null,2));if(results.some(r=>r.overflow||r.wordChecks.some(w=>w.split)))process.exitCode=1;
