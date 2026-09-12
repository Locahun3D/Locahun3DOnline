import fs from 'node:fs';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const out = 'F:/Codex/online-editor-save-20260912';
fs.mkdirSync(out, { recursive: true });
const bundle = await build({ bundle:true, write:false, platform:'browser', jsx:'automatic', tsconfig:'tsconfig.json',
  stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
import React from 'react'; import {createRoot} from 'react-dom/client';
import PropertyEditor from './src/components/admin/property-editor';
import {propertySchema} from './src/lib/schemas';
const initial=propertySchema.parse({id:'fixture',category:'studio',title:'編集検証物件',cover:{src:'/test.jpg',alt:'全景'},area:'東京',prefecture:'東京都',city:'渋谷区',summary:'これは自動保存確認専用の仮データです。',hourlyPrice:1000,urlConfirmedAt:'2026-09-12',updatedAt:'2026-09-12T00:00:00.000Z'});
window.fixture={server:structuredClone(initial),calls:[],version:0,holdDraft:false,holdPublish:false,failDraft:false};
createRoot(document.getElementById('root')).render(<PropertyEditor initial={initial} isAdmin/>);`},
  plugins:[{name:'isolated-actions',setup(b){
    b.onResolve({filter:/^next\/(navigation|link)$/},a=>({path:a.path,namespace:'fixture'}));
    b.onResolve({filter:/^@\/app\/admin\/_actions$/},()=>({path:'actions',namespace:'fixture'}));
    b.onResolve({filter:/(^@\/components\/admin\/file-dropzone$|^\.\/(asset-picker-modal|slug-editor|property-owner-panel)$)/},()=>({path:'empty',namespace:'fixture'}));
    b.onResolve({filter:/^\.\/use-preview-capture$/},()=>({path:'capture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/navigation'?`export function useRouter(){return {refresh(){throw Error('Unexpected refresh')}}}`:
      a.path==='next/link'?`export default function Link({children,href,...props}){return <a href={href} {...props}>{children}</a>}`:
      a.path==='capture'?`const noop=()=>{};export function usePreviewCapture(){return {capturedUrl:null,capturedIdx:null,clearResult:noop,queueCaptures:noop}}`:
      a.path==='empty'?`export default function Empty(){return null}`:`
async function write(kind,input,opts){const f=window.fixture;const data=typeof input==='string'?structuredClone(f.server):structuredClone(input);f.calls.push({kind,version:opts?.expectedUpdatedAt,title:data.title});
if(kind==='draft'&&f.holdDraft){f.holdDraft=false;await new Promise(r=>f.releaseDraft=r)}
if(kind==='publish'&&f.holdPublish){f.holdPublish=false;await new Promise(r=>f.releasePublish=r)}
if(kind==='draft'&&f.failDraft){f.failDraft=false;throw Error('fixture network failure')}
if(opts?.expectedUpdatedAt!==f.server.updatedAt)return {ok:false,conflict:true,serverUpdatedAt:f.server.updatedAt};
f.server={...data,status:kind==='publish'?'published':kind==='unpublish'?'draft':data.status,updatedAt:new Date(Date.UTC(2026,8,12,0,0,++f.version)).toISOString()};
if(kind==='publish'){f.server.titleEn='Generated title';f.server.cover.altEn='Generated cover'}
return {ok:true,id:f.server.id,updatedAt:f.server.updatedAt,status:f.server.status,property:structuredClone(f.server)}}
export const saveDraftAction=(p,o)=>write('draft',p,o);export const publishAction=(p,o)=>write('publish',p,o);export const unpublishAction=(p,o)=>write('unpublish',p,o);
export async function archiveAction(){throw Error('unexpected archive')} export async function deleteAction(){throw Error('unexpected delete')} export async function cleanupReplacedFileAction(){}` }));
  }}]});
const browser=await chromium.launch({channel:'chrome',headless:false});
try {
  const page=await browser.newPage();
  await page.goto('http://localhost:3032/sign-in',{waitUntil:'networkidle'});
  const styles=await page.locator('link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.href));
  assert(styles.length);
  const css=(await Promise.all(styles.map(async url=>(await page.request.get(url)).text()))).join('\n');
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
  async function mount(width){
    await page.goto('about:blank');
    await page.setViewportSize({width,height:1000});
    await page.setContent(`<html><head><style>${css}\nhtml{zoom:1!important}</style></head><body class="theme-online"><main style="padding:16px"><div id="root"></div></main></body></html>`);
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.locator('textarea[name="title"]').waitFor();
  }
  for(const width of [1440,820,390]){
    await mount(width);
    await page.evaluate(()=>{fixture.holdDraft=true;fixture.holdPublish=true});
    await page.locator('textarea[name="title"]').fill('保存待機中の入力');
    await page.waitForFunction(()=>fixture.calls.some(c=>c.kind==='draft'));
    await page.getByRole('button',{name:'公開する',exact:true}).click();
    assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.kind==='publish').length),0);
    await page.evaluate(()=>fixture.releaseDraft());
    await page.waitForFunction(()=>!!fixture.releasePublish);
    await page.locator('textarea[name="title"]').fill('公開処理中に追加入力');
    await page.evaluate(()=>fixture.releasePublish());
    await page.waitForFunction(()=>fixture.server.title==='公開処理中に追加入力'&&fixture.server.status==='published');
    assert.deepEqual(await page.evaluate(()=>[fixture.server.titleEn,fixture.server.cover.altEn]),['Generated title','Generated cover']);
    assert.equal(await page.locator('textarea[name="title"]').inputValue(),'公開処理中に追加入力');
    assert.equal(await page.getByText('別のタブ（または別の端末）',{exact:false}).count(),0);
    await page.getByRole('button',{name:'公開を停止',exact:true}).click();
    await page.getByRole('button',{name:'公開する',exact:true}).waitFor();
    await page.locator('textarea[name="title"]').fill('停止後も入力を保持');
    await page.waitForFunction(()=>fixture.server.title==='停止後も入力を保持'&&fixture.server.status==='draft');
    await page.screenshot({path:out+'/saved-'+width+'.png'});
    console.log('PASS real PropertyEditor '+width+': delayed save -> publish -> retain edit -> unpublish -> autosave');
  }
  await mount(1440);
  await page.evaluate(()=>{fixture.server.updatedAt='other-editor';fixture.server.title='他の編集者の更新'});
  await page.getByRole('button',{name:'公開する',exact:true}).click();
  await page.getByText('別のタブ（または別の端末）',{exact:false}).waitFor();
  await page.locator('textarea[name="title"]').fill('競合後の入力');
  await page.waitForTimeout(1800);
  assert.deepEqual(await page.evaluate(()=>[fixture.server.title,fixture.calls.map(c=>c.kind)]),['他の編集者の更新',['publish']]);
  await page.screenshot({path:out+'/real-conflict.png'});
  await mount(1440);
  await page.evaluate(()=>{fixture.holdDraft=true;fixture.failDraft=true});
  await page.locator('textarea[name="title"]').fill('失敗する保存');
  await page.waitForFunction(()=>!!fixture.releaseDraft);
  await page.getByRole('button',{name:'公開する',exact:true}).click();
  await page.evaluate(()=>fixture.releaseDraft());
  await page.getByText(/直前の保存に失敗/).waitFor();
  assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.kind==='publish').length),0);
  assert.equal(await page.locator('textarea[name="title"]').inputValue(),'失敗する保存');
  assert.deepEqual(errors,[]);
  console.log('PASS stale publication refused, later autosave stopped; failed save cancels queued publication and retains input. No authenticated/server writes.');
} finally {await browser.close()}
