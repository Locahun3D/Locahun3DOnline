import fs from 'node:fs';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Real components, isolated actions: no authentication or production data needed.
const out='F:/Codex/online-preview-simulation-20260912';
fs.mkdirSync(out,{recursive:true});
const result=await build({bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"'},
stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import RealDetail from './src/components/property-detail-view';
import PlanSwitcher from './src/components/admin/plan-preview-switcher';
const Detail=(props)=><RealDetail {...props} previewControls={<PlanSwitcher plan={props.isAdminUser?'admin':'free'} freeAccessActive={props.freeAccess}/>} property={{...props.property,pageBlocks:props.property.pageBlocks.map(b=>({...b,kind:'splat',caption:''}))}}/>;
import {previewViewerState} from './src/lib/preview-viewer-state';
import {propertySchema} from './src/lib/schemas';import {userSchema} from './src/lib/account-schema';
import ViewerGate from './src/components/viewer-gate';
import DataSalePanel from './src/components/data-sale-panel';
const admin=userSchema.parse({id:'admin',email:'admin@example.test',name:'Admin',role:'admin'});
const p=propertySchema.parse({id:'fixture',category:'studio',title:'表示確認専用物件',cover:{},summary:'権限ごとの表示確認',splatItems:['public','restricted','nda_only'].map((accessLevel,i)=>({id:'scene'+i,label:accessLevel+'シーン',accessLevel,splatUrl:'/fixture'+i+'.splat',sizeMb:600,forSale:true,salePrice:1000,downloadFileUrl:'/fixture.zip'}))});
window.calls=[];window.fetch=async(url)=>{window.calls.push(String(url));return {ok:true,status:200,json:async()=>({url:'/mock-signed'})}};
window.open=()=>{window.calls.push('popup');return {location:{href:''},close(){}}};
function App(){const [plan,setPlan]=useState('free');const [blocks,setBlocks]=useState(false);const [free,setFree]=useState(false);return <><div style={{padding:20}}><select aria-label="プラン" value={plan} onChange={e=>setPlan(e.target.value)}>{['admin','guest','free','individual','studio','team','team_nda'].map(p=><option key={p}>{p}</option>)}</select><label><input aria-label="無料期間" type="checkbox" checked={free} onChange={e=>setFree(e.target.checked)}/>無料期間</label><label><input aria-label="ビルダー" type="checkbox" checked={blocks} onChange={e=>setBlocks(e.target.checked)}/>ビルダー</label><p>表示のみ確認します。残高・購入履歴は再現せず、視聴・購入・送信は実行しません。</p></div><Detail key={plan+blocks+free} property={{...p,pageBlocks:blocks?[{id:'scenes',kind:'splats'}]:[]}} others={[]} preview freeAccess={free} {...previewViewerState(plan,admin)}/></>}
window.renderShared=()=>{const d=document.createElement('div');d.id='shared';document.body.append(d);createRoot(d).render(<ViewerGate splatUrl='/fixture0.splat' propertyId='fixture' label='共有' sizeMb={1} previewToken='fixture-token'/>)};
const transitionDiv=document.createElement('div');transitionDiv.id='transition';document.body.append(transitionDiv);const transitionRoot=createRoot(transitionDiv);
window.renderCartTransition=(displaySimulation)=>transitionRoot.render(<DataSalePanel propertyId='fixture' propertyTitle='確認' splatItemIndex={0} itemLabel='確認' licenseOptions={[{license:'standard',price:1000}]} purchaseContents={[]} description='' scannedAt='' splatSizeMb={1} displaySimulation={displaySimulation}/>);
createRoot(document.getElementById('root')).render(<App/>);`},
plugins:[{name:'isolate',setup(b){
b.onResolve({filter:/^next\/(link|image|navigation)$/},a=>({path:a.path,namespace:'stub'}));
b.onResolve({filter:/^@\/components\/(locale-provider|bookmark-button|inquiry-panel|property-comments)$/},a=>({path:a.path,namespace:'stub'}));
b.onResolve({filter:/^@\/lib\/(cart|contact-actions)$/},a=>({path:a.path,namespace:'stub'}));
b.onLoad({filter:/.*/,namespace:'stub'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:
a.path==='next/link'?`export default function Link({children,...props}){return <a {...props}>{children}</a>}`:
a.path==='next/image'?`export default function Image({fill,priority,...props}){return <img {...props}/ >}`:
a.path.endsWith('locale-provider')?`export const useLocale=()=> 'ja';export const useHref=()=>x=>x;`:
a.path.endsWith('/cart')?`export const isInCart=()=>{window.calls.push('cart-read');return !!window.realCart};export const onCartChange=()=>()=>{};export const addToCart=()=>window.calls.push('cart-add');export const removeFromCart=()=>window.calls.push('cart-remove');`:
a.path.endsWith('contact-actions')?`export const submitContactRequestAction=async()=>{window.calls.push('contact');return {}}`:
a.path==='next/navigation'?`export const useRouter=()=>({});export const usePathname=()=>'/';`:
`export default function Empty(){return null}` }));
}}]});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
await page.goto('http://localhost:3032/sign-in',{waitUntil:'networkidle'});
const styles=await page.locator('link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.href));
const css=(await Promise.all(styles.map(async u=>(await page.request.get(u)).text()))).join('\n');
for(const width of [1440,820,390]){
await page.goto('about:blank');await page.setViewportSize({width,height:1000});
await page.setContent('<html><head><style>'+css+'\nhtml{zoom:1!important}</style></head><body class="theme-online"><div id="root"></div></body></html>');
await page.addScriptTag({content:result.outputFiles[0].text});await page.getByLabel('プラン').waitFor();
for(const [plan,count] of [['guest',1],['free',1],['individual',1],['studio',1],['team',2],['team_nda',3]]){
await page.getByLabel('プラン').selectOption(plan);
await page.waitForTimeout(80);
const viewers=page.locator('div.aspect-video > a, div.aspect-video > button');
assert.equal(await viewers.count(),count,plan);
if(plan==='guest')assert.equal(await viewers.first().isDisabled(),true);
else {assert.equal(await viewers.first().getAttribute('href'),null);await viewers.first().click();}
}
await page.getByLabel('プラン').selectOption('free');
await page.locator('input[type="checkbox"]:not([aria-label])').first().check();
await page.getByRole('button',{name:'カートに入れる',exact:true}).first().click();
await page.getByRole('button',{name:'購入する',exact:true}).first().click();
assert(await page.locator('[inert]').count());assert.deepEqual(await page.evaluate(()=>calls),[]);
await page.screenshot({path:out+'/simulation-'+width+'.png',fullPage:true});
await page.getByLabel('無料期間').check();
await page.getByLabel('プラン').selectOption('team');
assert.equal(await page.locator('div.aspect-video > a').count(),2);
await page.getByLabel('プラン').selectOption('guest');
await page.locator('div.aspect-video > a').first().click();
assert.deepEqual(await page.evaluate(()=>calls),[]);
await page.getByLabel('無料期間').uncheck();await page.getByLabel('プラン').selectOption('free');
await page.evaluate(()=>window.matchMedia=()=>({matches:true}));
await page.getByLabel('ビルダー').check();await page.waitForTimeout(80);
const blockViewer=page.locator('div.aspect-video > a').first();assert.equal(await blockViewer.getAttribute('href'),null);await blockViewer.click();
assert.deepEqual(await page.evaluate(()=>calls),[]);
await page.getByLabel('プラン').selectOption('admin');
await page.evaluate(()=>window.matchMedia=()=>({matches:false}));
await page.locator('div.aspect-video > a').first().click();
await page.waitForFunction(()=>calls.some(x=>x.includes('/api/viewer-asset')));
await page.evaluate(()=>{calls.length=0;renderShared()});
await page.locator('#shared a').click();
await page.waitForFunction(()=>calls.some(x=>x.includes('preview=fixture-token')));
await page.evaluate(()=>{window.realCart=true;renderCartTransition(false)});
await page.locator('#transition').getByRole('link',{name:'カートを見る'}).waitFor();
await page.locator('#transition input[type="checkbox"]').check();
await page.evaluate(()=>{calls.length=0;renderCartTransition(true)});
await page.waitForTimeout(80);
assert.equal(await page.locator('#transition').getByRole('link',{name:'カートを見る'}).count(),0,'simulation must hide retained real cart link');
assert.equal(await page.locator('#transition input[type="checkbox"]').isChecked(),true,'same mounted component');
await page.locator('#transition').getByRole('button',{name:'カートに入れる'}).click();
assert.deepEqual(await page.evaluate(()=>calls),[]);
await page.evaluate(()=>renderCartTransition(false));
await page.locator('#transition').getByRole('link',{name:'カートを見る'}).waitFor();
console.log('PASS real detail/viewer/sale '+width+': plans, no simulation effects, builder, real admin viewer');
}
assert.deepEqual(errors,[]);
}finally{await browser.close()}
