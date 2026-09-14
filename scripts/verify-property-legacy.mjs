import fs from 'node:fs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';

const out=process.env.OUT_DIR||'artifacts/property-legacy';fs.mkdirSync(out,{recursive:true});
const base=process.env.BASE_URL||'http://localhost:3032';
if(process.argv.includes('--serve')){
 createServer((req,res)=>{const name=(req.url||'/').split('?')[0].replace(/^\//,'')||'ja-representative.html';if(!/^[a-z0-9.-]+$/.test(name)){res.writeHead(400).end();return;}try{res.setHeader('content-type',name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(`${out}/${name}`));}catch{res.writeHead(404).end();}}).listen(8840,'127.0.0.1',()=>console.log('Safe fixture: http://127.0.0.1:8840/'));
 await new Promise(()=>{});
}
// Production NODE_ENV matters: ViewerGate intentionally bypasses subscription checks in dev.
const built=await build({bundle:true,write:false,outdir:'fixture',format:'esm',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from 'react';import{createRoot}from'react-dom/client';import View from './src/components/property-detail-view';import{propertySchema}from './src/lib/schemas';const f=window.fixture;const scene=(id,label,accessLevel='public')=>({id,label,accessLevel,splatUrl:'/fixture/'+id+'.rad',forSale:!f.noSale,salePrice:200000,licenseOptions:[{license:'standard',price:200000},{license:'extended',price:400000}],downloadFiles:[{url:'/fixture/'+id+'.rad',format:'RAD'}],sizeMb:120,saleDescription:'検証用データ / Fixture data'});const property=propertySchema.parse({id:'shibuyasq',title:f.locale==='ja'?'渋谷スクランブル交差点':'Shibuya Scramble Crossing',category:'outdoor',status:f.preview?'draft':'published',prefecture:'東京都',city:'渋谷区',address:'東京都渋谷区',nearestStation:'渋谷駅',priceType:'hourly',hourlyPrice:10000,dailyPrice:50000,description:'検証用の物件説明。写真は公開ページの既存画像です。',cover:{src:'https://locahun3d.com/api/r2/assets/image/NbJ-IS95yS-shibuya-scramble-crossing-5_large.jpg',alt:'渋谷スクランブル交差点'},gallery:[{src:'https://locahun3d.com/api/r2/assets/image/65MVFXIF3T-shibuya-scramble-gallery-2.webp',alt:'Kakidai · CC BY-SA 4.0'}],splatItems:f.none?[]:[scene('first','メインシーン / Main scene'),...(f.multiple?[scene('restricted','非公開シーン / Restricted scene','restricted'),scene('second','長いシーン名の別アングル確認用 / Alternative angle with a long scene name'),scene('nda','NDA scene','nda_only')]:[])]});if(f.many){property.splatItems=Array.from({length:12},(_,i)=>scene('scene-'+i,'第'+(i+1)+'シーン / Entrance and interior overview '+(i+1)));}if(f.mixed){property.splatItems[2].forSale=false;property.splatItems.push({...property.splatItems[0],id:'third',label:'Third sale scene',splatUrl:'/fixture/third.rad'});}if(f.video)property.splatItems[0].previewVideoUrl='data:video/mp4;base64,';if(f.representative){property.cover.alt='shibuya-scramble-crossing-5_large';property.contactEmail='fixture-inquiry@example.test';property.priceType='flat';property.hourlyPrice=0;property.dailyPrice=0;property.permitRequired=true;property.permitType=f.locale==='ja'?'道路使用許可':'Road use permit';property.address='東京都渋谷区（渋谷スクランブル交差点・ハチ公前）';property.nearestStation='各線 渋谷駅 ハチ公口すぐ（徒歩約1分）';property.availableHours='公道（24時間）／撮影には道路使用許可が必要';property.permitNotes='渋谷駅周辺での撮影に関しましては、渋谷警察署（03-3498-0110）へ相談してください。';property.gallery.push({src:'https://locahun3d.com/api/r2/assets/image/sLsA8AdHRO-shibuya-scramble-gallery-1.webp',alt:'Benh Lieu Song · CC BY-SA 2.0'});property.scannedAt='2026-07-06';property.splatItems[0].previewVideoUrl='https://locahun3d.com/api/r2/uploads/shibuya-scramble-crossing/0-preview.mp4';property.tokenCost=5;property.zipSizeMb=891;property.description=f.locale==='ja'?'東京都渋谷区の渋谷スクランブル交差点。':'Shibuya Scramble Crossing, Shibuya, Tokyo.';property.splatItems[0].sizeMb=1118;property.splatItems[0].saleDescription='';property.splatItems[0].downloadFiles=[{url:'/fixture/data.zip',format:'PLY & OBJ (ZIP)',sizeMb:891}];}createRoot(document.getElementById('root')).render(<View property={property} others={[]} locale={f.locale} preview={f.preview} sharePreview={f.preview} previewToken={f.preview?'fixture-preview':undefined} hasViewerAccess={f.unlocked||f.representative} signedIn={f.unlocked||f.representative} unlockedItemIds={f.unlocked?['first']:[]} />);`},plugins:[{name:'safe-boundaries',setup(b){
 b.onResolve({filter:/^(?:next\/|@\/lib\/(?:cart|viewer|.*-actions)$|@\/components\/locale-provider$)/},a=>({path:a.path,namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},a=>{let contents;
  if(a.path==='next/link')contents='export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}';
  else if(a.path==='next/navigation')contents='export const useRouter=()=>({push(){},refresh(){}});';
  else if(a.path.endsWith('locale-provider'))contents='export const useLocale=()=>window.fixture.locale;export const useHref=()=>p=>window.fixture.locale==="en"?"/en"+p:p;';
  else if(a.path.endsWith('/viewer'))contents='export const proxySplatUrl=u=>u;export const buildViewerUrl=u=>"about:blank#fixture-viewer";';
  else if(a.path.endsWith('/cart'))contents='export const isInCart=()=>false;export const onCartChange=()=>()=>{};export const addToCart=(v)=>window.fixtureCalls.push({name:"cart",value:v});export const removeFromCart=()=>{};';
  else contents=['toggleBookmarkAction','getBookmarkContextAction','saveBookmarkToFolderAction','postCommentAction','deleteCommentAction','reportCommentAction','unhideCommentAction','toggleCommentLikeAction','submitContactRequestAction','submitInquiryAction'].map(n=>`export const ${n}=async()=>({ok:false,error:'Safe fixture only'});`).join('\n');
  return{contents,loader:'jsx',resolveDir:process.cwd()};
 });
}}]});
const js=built.outputFiles.find(f=>f.path.endsWith('.js')).text,moduleCss=built.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
fs.writeFileSync(`${out}/fixture.js`,js);
const browser=await chromium.launch({channel:'chrome',headless:false});const results=[];
try {
const page=await browser.newPage();await page.goto(base+'/contact',{waitUntil:'domcontentloaded'});
const header=await page.locator('header').first().evaluate(e=>e.outerHTML);
const css=(await Promise.all((await page.locator('link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.href))).map(async u=>(await page.request.get(u)).text()))).join('\n');
for(const locale of ['ja','en'])for(const width of [1440,1180,820,390])for(const count of [1,12]){
 await page.goto('about:blank');await page.setViewportSize({width,height:900});
 await page.setContent('<html lang="'+locale+'"><head><style>'+css+'\n'+moduleCss+'</style></head><body>'+header+'<main><div id="root"></div></main></body></html>');
 await page.evaluate(f=>{window.fixture=f;window.fixtureCalls=[];window.fetch=async()=>new Response('{}',{status:402});window.open=()=>null;},{locale,many:count===12});
 await page.addScriptTag({type:'module',content:js});await page.locator('[data-property-legacy]').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 const errors=[];if(await page.locator('[data-scene-card]').count()!==count)errors.push('scene count');
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('[data-property-legacy] *')].filter(e=>e.getClientRects().length&&!e.closest('details:not([open])')).some(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);}));if(overflow)errors.push('overflow');
 await page.locator('img').evaluateAll(ns=>Promise.all(ns.map(n=>{n.loading='eager';return n.decode().catch(()=>{});}))); 
 await page.screenshot({path:out+'/'+locale+'-'+width+'-'+count+'-hero.png'});
 await page.locator('[data-scene-card]').first().scrollIntoViewIfNeeded();
 await page.waitForTimeout(1200);
 await page.screenshot({path:out+'/'+locale+'-'+width+'-'+count+'-scenes.png'});
 results.push({locale,width,count,errors});console.log(locale,width,count,errors.length?errors:'PASS');
}
}finally{await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));}
if(results.some(r=>r.errors.length))process.exitCode=1;
