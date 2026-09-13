import fs from 'node:fs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';

const out='artifacts/property-workspace';fs.mkdirSync(out,{recursive:true});
const base=process.env.BASE_URL||'http://localhost:3032';
if(process.argv.includes('--serve')){
 createServer((req,res)=>{const name=(req.url||'/').split('?')[0].replace(/^\//,'')||'ja-representative.html';if(!/^[a-z0-9.-]+$/.test(name)){res.writeHead(400).end();return;}try{res.setHeader('content-type',name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(`${out}/${name}`));}catch{res.writeHead(404).end();}}).listen(8840,'127.0.0.1',()=>console.log('Safe fixture: http://127.0.0.1:8840/'));
 await new Promise(()=>{});
}
// Production NODE_ENV matters: ViewerGate intentionally bypasses subscription checks in dev.
const built=await build({bundle:true,write:false,outdir:'fixture',format:'esm',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from 'react';import{createRoot}from'react-dom/client';import View from './src/components/property-detail-view';import{propertySchema}from './src/lib/schemas';const f=window.fixture;const scene=(id,label,accessLevel='public')=>({id,label,accessLevel,splatUrl:'/fixture/'+id+'.rad',forSale:!f.noSale,salePrice:200000,licenseOptions:[{license:'standard',price:200000},{license:'extended',price:400000}],downloadFiles:[{url:'/fixture/'+id+'.rad',format:'RAD'}],sizeMb:120,saleDescription:'検証用データ / Fixture data'});const property=propertySchema.parse({id:'shibuyasq',title:f.locale==='ja'?'渋谷スクランブル交差点':'Shibuya Scramble Crossing',category:'outdoor',status:f.preview?'draft':'published',prefecture:'東京都',city:'渋谷区',address:'東京都渋谷区',nearestStation:'渋谷駅',priceType:'hourly',hourlyPrice:10000,dailyPrice:50000,description:'検証用の物件説明。写真は公開ページの既存画像です。',cover:{src:'https://locahun3d.com/api/r2/assets/image/NbJ-IS95yS-shibuya-scramble-crossing-5_large.jpg',alt:'渋谷スクランブル交差点'},gallery:[{src:'https://locahun3d.com/api/r2/assets/image/65MVFXIF3T-shibuya-scramble-gallery-2.webp',alt:'Kakidai · CC BY-SA 4.0'}],splatItems:f.none?[]:[scene('first','メインシーン / Main scene'),...(f.multiple?[scene('restricted','非公開シーン / Restricted scene','restricted'),scene('second','長いシーン名の別アングル確認用 / Alternative angle with a long scene name'),scene('nda','NDA scene','nda_only')]:[])]});if(f.mixed){property.splatItems[2].forSale=false;property.splatItems.push({...property.splatItems[0],id:'third',label:'Third sale scene',splatUrl:'/fixture/third.rad'});}if(f.video)property.splatItems[0].previewVideoUrl='data:video/mp4;base64,';if(f.representative){property.contactEmail='fixture-inquiry@example.test';property.priceType='flat';property.hourlyPrice=0;property.dailyPrice=0;property.permitRequired=true;property.permitType=f.locale==='ja'?'道路使用許可':'Road use permit';property.address='東京都渋谷区（渋谷スクランブル交差点・ハチ公前）';property.nearestStation='各線 渋谷駅 ハチ公口すぐ（徒歩約1分）';property.availableHours='公道（24時間）／撮影には道路使用許可が必要';property.permitNotes='渋谷駅周辺での撮影に関しましては、渋谷警察署（03-3498-0110）へ相談してください。';property.gallery.push({src:'https://locahun3d.com/api/r2/assets/image/sLsA8AdHRO-shibuya-scramble-gallery-1.webp',alt:'Benh Lieu Song · CC BY-SA 2.0'});property.scannedAt='2026-07-06';property.splatItems[0].previewVideoUrl='https://locahun3d.com/api/r2/uploads/shibuya-scramble-crossing/0-preview.mp4';property.tokenCost=5;property.zipSizeMb=891;property.description=f.locale==='ja'?'東京都渋谷区の渋谷スクランブル交差点。':'Shibuya Scramble Crossing, Shibuya, Tokyo.';property.splatItems[0].sizeMb=1118;property.splatItems[0].saleDescription='';property.splatItems[0].downloadFiles=[{url:'/fixture/data.zip',format:'PLY & OBJ (ZIP)',sizeMb:891}];}createRoot(document.getElementById('root')).render(<View property={property} others={[]} locale={f.locale} preview={f.preview} sharePreview={f.preview} previewToken={f.preview?'fixture-preview':undefined} hasViewerAccess={f.unlocked||f.representative} signedIn={f.unlocked||f.representative} unlockedItemIds={f.unlocked?['first']:[]} />);`},plugins:[{name:'safe-boundaries',setup(b){
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
try{
 const page=await browser.newPage();const headers={};let css='';
 for(const locale of ['ja','en']){
  await page.goto(base+(locale==='en'?'/en':'')+'/contact',{waitUntil:'networkidle'});
  headers[locale]=await page.locator('header').first().evaluate(e=>e.outerHTML);
  if(!css){const links=await page.locator('link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.href));css=(await Promise.all(links.map(async u=>(await page.request.get(u)).text()))).join('\n');}
 }
 for(const locale of (process.env.QA_LOCALES?.split(',')||['ja','en']))for(const width of (process.env.QA_WIDTHS?.split(',').map(Number)||[1440,820,390,320]))for(const state of (process.env.QA_STATES?.split(',')||['representative','video','locked','unlocked','multiple','no-sale','preview','no-scene'])){
  const f={locale,mixed:state==='mixed-sale',video:state==='video',representative:state==='representative',unlocked:state==='unlocked'||state==='video',multiple:state==='multiple'||state==='preview'||state==='mixed-sale',noSale:state==='no-sale',preview:state==='preview',none:state==='no-scene'};
  await page.goto('about:blank');await page.setViewportSize({width,height:width<500?844:900});
  const runtime=[];const handler=e=>runtime.push(e.message);page.on('pageerror',handler);
  await page.setContent(`<!doctype html><html lang="${locale}"><head><style>${css}\n${moduleCss}</style></head><body>${headers[locale]}<main><div id="root"></div></main></body></html>`);
  await page.evaluate(f=>{window.fixture=f;window.fixtureCalls=[];window.fetch=async(u,o)=>{window.fixtureCalls.push({name:'fetch',url:String(u),method:o?.method||'GET'});return new Response(JSON.stringify({error:'Safe fixture blocked',tokenBalance:0,purchasedTokens:0,bonusTokens:0,tokenCost:1}),{status:402,headers:{'content-type':'application/json'}})};window.open=()=>({location:{href:''},close(){}});},f);
  await page.addScriptTag({type:'module',content:js});await page.locator('h1').waitFor();
  if(f.video||f.representative)await page.locator('[data-property-viewing]').scrollIntoViewIfNeeded();
  if(f.video){await page.locator('video').waitFor();await page.locator('video').evaluate(e=>{e.poster='https://locahun3d.com/api/r2/assets/image/NbJ-IS95yS-shibuya-scramble-crossing-5_large.jpg';});}
  let playback;
  if(f.representative){await page.locator('video').waitFor();await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&v.currentTime>0;});const start=await page.locator('video').evaluate(v=>v.currentTime);await page.waitForFunction(t=>document.querySelector('video').currentTime>t+0.2,start);playback=await page.locator('video').evaluate(v=>({readyState:v.readyState,currentTime:v.currentTime,videoWidth:v.videoWidth,videoHeight:v.videoHeight,paused:v.paused}));playback.startTime=start;}
  if(width===1440)fs.writeFileSync(`${out}/${locale}-${state}.html`,`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>物件レイアウト検証 / Safe fixture</title><style>${css}\n${moduleCss}</style></head><body>${headers[locale]}<main><div style="padding:6px 20px;background:#fff3cd;font-size:12px">検証用表示・実データではありません。購入・閲覧解除は実行されません。</div><div id="root"></div></main><script>window.fixture=${JSON.stringify(f)};window.fixtureCalls=[];window.fetch=async()=>new Response('{}',{status:402});window.open=()=>({location:{},close(){}});</script><script type="module" src="fixture.js"></script></body></html>`);
  await page.locator('img').evaluateAll(ns=>{for(const n of ns)n.loading='eager';return Promise.race([Promise.all(ns.map(n=>n.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,3000))]);});
  await page.evaluate(()=>scrollTo(0,0));
  const errors=[];
  const geometry=await page.evaluate(()=>{
   const rect=e=>{if(!e||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
   const view=document.querySelector('[data-property-viewing]'),purchase=document.querySelector('[data-property-purchase]'),photos=document.querySelector('[data-property-photos],[aria-label="物件写真"],[aria-label="Property photos"]');
   const escaped=[...document.querySelectorAll('#root *')].filter(e=>{if(!e.getClientRects().length||e.closest('details:not([open])')||['absolute','fixed','sticky'].includes(getComputedStyle(e).position))return false;for(let a=e.parentElement;a&&a.id!=='root';a=a.parentElement)if(['auto','scroll'].includes(getComputedStyle(a).overflowX))return false;const r=e.getBoundingClientRect(),p=e.parentElement?.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1||(p&&(r.left<p.left-1||r.right>p.right+1)));}).map(e=>({tag:e.tagName,text:e.textContent.slice(0,60),...rect(e)}));
   const gate=view?.querySelector('.group > a.absolute,.group > button.absolute');
   const gateRect=rect(gate),gateText=gate?[...gate.children].map(e=>({text:e.textContent,...rect(e)})):[];
   const gateClipped=gateRect?gateText.some(r=>r.x<gateRect.x-1||r.right>gateRect.right+1||r.y<gateRect.y-1||r.bottom>gateRect.bottom+1):false;
   const regions=Object.fromEntries(['facts','access','contact','workspace','license','photo'].map(n=>[n,rect(document.querySelector('[data-property-'+n+']'))]));
   const licenseCards=purchase?[...purchase.querySelectorAll('label')].filter(e=>e.querySelector('input[type="radio"]')).map(e=>({text:e.textContent,...rect(e)})):[];
   return{view:rect(view),purchase:rect(purchase),photos:rect(photos),regions,licenseCards,escaped,gateRect,gateText,gateClipped,gateOpacity:gate?getComputedStyle(gate).opacity:null,video:rect(view?.querySelector('video')),heading:rect(document.querySelector('h1')),header:rect(document.querySelector('header'))};
  });
  if(geometry.escaped.length)errors.push('Parent/viewport overflow');
  if(!f.none&&!geometry.view)errors.push('Viewer region missing');
  if(!f.none&&(geometry.gateClipped||geometry.gateOpacity!=='1'))errors.push('Gate instruction hidden/clipped');
  if((f.video||f.representative)&&(!geometry.video||geometry.video.bottom>geometry.gateRect.y+2||geometry.video.height<100))errors.push('Video covered by gate instructions');
  if(f.representative&&geometry.video&&Math.abs(geometry.video.width/geometry.video.height-16/9)>.02)errors.push('Preview frame aspect differs from public video');
  if((f.noSale||f.preview||f.none)&&geometry.purchase)errors.push('Purchase guard violated');
  if(!f.noSale&&!f.preview&&!f.none&&!geometry.purchase)errors.push('Sale panel missing');
  if(geometry.photos&&geometry.purchase){if(width>=820&&!(geometry.photos.x<geometry.purchase.x&&(f.multiple||Math.abs(geometry.photos.y-geometry.purchase.y)<3)))errors.push('Photo/purchase not adjacent');if(width<=390&&geometry.purchase.y<geometry.photos.bottom-2)errors.push('Mobile purchase overlaps photos');}
  if(!geometry.photos)errors.push('Separate photos missing');
  for(const n of ['facts','access','contact','workspace','license','photo'])if(!geometry.regions[n]&&!(f.none&&n==='workspace')&&!(n==='license'&&!geometry.purchase))errors.push('Missing original-layout region '+n);
  const {facts,workspace,license,photo}=geometry.regions;
  if(facts&&geometry.photos&&facts.y<Math.max(geometry.photos.bottom,geometry.purchase?.bottom||0)-2)errors.push('Facts must follow photo/purchase');
  if(facts&&workspace&&workspace.y<facts.bottom-2)errors.push('3DGS must follow facts');
  if(workspace&&license&&license.y<workspace.bottom-2)errors.push('License notes must follow 3DGS');
  if(photo){const expected=width>=1400?16/9:width>=701?16/10:4/3;if(Math.abs(photo.width/photo.height-expected)>.08)errors.push('Original photo aspect changed');}
  if(f.representative&&photo){const reference={1440:759.34,820:416.81,390:341,320:271}[width];if(Math.abs(photo.width/reference-1)>.06)errors.push('Original photo width differs >6%');if(width>=820&&geometry.purchase&&Math.abs(geometry.photos.x-(width-geometry.purchase.right))>30)errors.push('Original top workspace is not centered');}
  if(geometry.purchase){if(geometry.licenseCards.length!==2)errors.push('Two original license cards missing');for(const [i,card]of geometry.licenseCards.entries()){if(card.height<95||!card.text.includes(i===0?'200,000':'400,000'))errors.push('Original license card price/size missing');}if(geometry.licenseCards.length===2&&geometry.licenseCards[1].y<geometry.licenseCards[0].bottom-1)errors.push('License cards not vertical');}
  const key=`${locale}-${width}-${state}`;await page.screenshot({path:`${out}/${key}-initial.png`});await page.screenshot({path:`${out}/${key}-full.png`,fullPage:true,clip:{x:0,y:0,width,height:await page.evaluate(()=>Math.ceil(document.body.getBoundingClientRect().bottom))}});
  if(f.representative&&facts&&workspace&&license)await page.screenshot({path:`${out}/${key}-lower-sections.png`,fullPage:true,clip:{x:0,y:Math.floor(facts.y),width,height:Math.ceil(license.y+Math.min(license.height,300)-Math.floor(facts.y))}});
  const thumbs=page.locator('[data-property-photos] button[aria-pressed]');
  if(await thumbs.count()>1){const before=await page.locator('[data-property-photo] img').getAttribute('src');await thumbs.last().click();const after=await page.locator('[data-property-photo] img').getAttribute('src');if(before===after)errors.push('Photo thumbnail selection failed');await page.locator('[data-property-photo] img').click();await page.getByRole('dialog').waitFor();const photoContained=await page.getByRole('dialog').locator('img').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1});if(!photoContained)errors.push('Zoomed photo clipped');await page.screenshot({path:`${out}/${key}-photo-zoom.png`});await page.keyboard.press('Escape');await thumbs.first().click();}
  if(f.multiple&&!f.mixed){const pickers=page.getByRole('group',{name:locale==='en'?'Choose a 3DGS scene':'3DGSシーンを選択'}),picker=pickers.first();if(await picker.locator('button').count()!==2)errors.push('Restricted/NDA scene leaked');await picker.locator('button').last().click();if(!(await page.locator('[data-property-viewing]').innerText()).includes('Alternative angle'))errors.push('Scene selection failed');if(!f.preview){await pickers.last().locator('button').first().click();if(!(await page.locator('[data-property-purchase]').innerText()).includes('Main scene'))errors.push('Lower picker did not sync purchase');await pickers.last().locator('button').last().click();if(!(await page.locator('[data-property-purchase]').innerText()).includes('Alternative angle'))errors.push('Lower picker purchase scene mismatch');}}
  if(f.mixed){const picker=page.getByRole('group',{name:locale==='en'?'Choose a 3DGS scene':'3DGSシーンを選択'}).last();if(await picker.locator('button').count()!==3)errors.push('Mixed scene filter count');await picker.locator('button').nth(1).click();if(await page.locator('[data-property-purchase]').count())errors.push('Non-sale middle scene shows purchase');if(!(await page.locator('[data-property-viewing]').innerText()).includes('Alternative angle'))errors.push('Non-sale middle scene viewer wrong');await picker.locator('button').last().click();if(!(await page.locator('[data-property-purchase]').innerText()).includes('Third sale scene'))errors.push('Sale scene after empty slot misaligned');}
  if(!f.none){await page.locator('[data-property-viewing]').hover();await page.screenshot({path:`${out}/${key}-viewer-hover.png`});}
  if(state==='multiple'||f.mixed){
   const panel=page.locator('[data-property-purchase]');
   await panel.getByRole('checkbox').check();
   await panel.getByRole('button',{name:locale==='en'?'Add to cart':'カートに入れる',exact:true}).click();
   const cart=await page.evaluate(()=>window.fixtureCalls.find(c=>c.name==='cart'));
   if(cart?.value?.splatItemIndex!==(f.mixed?4:2))errors.push('Filtered scene original purchase index lost');
  }
  if(state==='locked'){
   await page.locator('[data-property-viewing] .group > button').click();
   const close=page.getByRole('button',{name:locale==='en'?'Close':'閉じる',exact:true});await close.waitFor();
   const contained=await close.evaluate(e=>{const r=e.parentElement.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1});
   if(!contained)errors.push('Auth modal clipped');
   await page.screenshot({path:`${out}/${key}-auth-modal.png`});await close.click();
  }
  if(state==='representative'){
   await page.evaluate(()=>{const original=window.matchMedia.bind(window);window.matchMedia=q=>q==='(pointer: coarse)'?{matches:true}:original(q);});
   await page.locator('[data-property-viewing] .group > a').click();
   const cancel=page.getByRole('button',{name:locale==='en'?'Cancel':'閉じる',exact:true});await cancel.waitFor();
   if(!(await cancel.evaluate(e=>{const r=e.closest('.fixed').firstElementChild.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})))errors.push('Large-scene warning clipped');
   await page.screenshot({path:`${out}/${key}-large-warning.png`});await cancel.click();
  }
  const calls=await page.evaluate(()=>window.fixtureCalls);if(calls.some(c=>c.name!=='cart'))errors.push('Unexpected write attempt');
  results.push({locale,width,state,errors:[...errors,...runtime],calls,playback,...geometry});page.off('pageerror',handler);console.log(key,errors.length?'FAIL '+errors.join(', '):'PASS');
 }
}finally{await browser.close();fs.writeFileSync(`${out}/${process.env.QA_STATES?'targeted-results':'results'}.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify({cases:results.length,failures:results.filter(r=>r.errors.length)},null,2));if(results.some(r=>r.errors.length))process.exitCode=1;
