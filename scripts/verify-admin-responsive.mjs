import fs from 'node:fs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const out=process.env.OUT_DIR||'artifacts/admin-responsive';fs.mkdirSync(out,{recursive:true});
const results=[];
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage();await page.goto('http://localhost:3032/contact',{waitUntil:'domcontentloaded'});
 const css=(await Promise.all((await page.locator('link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.href))).map(async u=>(await page.request.get(u)).text()))).join('\n');
 for(const mode of ['list','editor']){
 const b=await build({bundle:true,write:false,outdir:'fixture',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"'},stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from 'react';import{createRoot}from'react-dom/client';import View from './src/components/admin/${mode==='list'?'properties-admin':'property-editor'}';import{propertySchema}from './src/lib/schemas';const p=propertySchema.parse({id:'fixture-long-id',title:'撮影スタジオ第一倉庫・長い物件名と複数フロアの管理表示検証',category:'studio',city:'東京都渋谷区',cover:{},splatItems:Array.from({length:12},(_,i)=>({id:'s'+i,label:'第'+(i+1)+'フロア・長いシーン名の管理表示確認',src:'/fixture.rad',format:'rad'}))});createRoot(document.getElementById('root')).render(<View isAdmin initial={p} items={Array.from({length:4},(_,i)=>({...p,id:'f'+i,status:i?'draft':'published'}))}/>);`},plugins:[{name:'safe',setup(b){
 b.onResolve({filter:/^(next\/(navigation|link)|@\/app\/admin\/_actions)$/},a=>({path:a.path,namespace:'safe'}));
 b.onResolve({filter:/(^@\/components\/admin\/file-dropzone$|^\.\/(asset-picker-modal|slug-editor|property-owner-panel|use-preview-capture)$)/},a=>({path:a.path,namespace:'safe'}));
 b.onLoad({filter:/.*/,namespace:'safe'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/link'?'export default function Link({children,...p}){return <a {...p}>{children}</a>}':a.path==='next/navigation'?'export const useRouter=()=>({refresh(){},push(){}})':a.path.endsWith('_actions')?'const no=async()=>{throw Error("No fixture mutations")};export const bulkSetStatusAction=no,bulkDeleteAction=no,publishByIdAction=no,saveDraftAction=no,publishAction=no,unpublishAction=no,archiveAction=no,deleteAction=no,cleanupReplacedFileAction=no;':a.path.endsWith('use-preview-capture')?'export const usePreviewCapture=()=>({clearResult(){},queueCaptures(){}})':'export default function Empty(){return null}'}));
 }}]});
 const js=b.outputFiles.find(f=>f.path.endsWith('.js')).text,extra=b.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
 for(const width of [1440,820,1180,390]){
 await page.goto('about:blank');await page.setViewportSize({width,height:width===1180?820:1100});await page.setContent(`<html><head><style>${css}\n${extra}</style></head><body class="theme-online"><main class="frame ui-page-shell"><div id="root"></div></main></body></html>`);
 await page.addScriptTag({content:js});await page.locator(mode==='list'?'input[type="search"]':'h1').first().waitFor();
 if(mode==='editor')await page.getByRole('button',{name:/06 3DGS/}).click();
 const metric=await page.evaluate(()=>({overflow:[...document.querySelectorAll('#root *')].some(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}),scrollers:[...document.querySelectorAll('#root *')].filter(e=>getComputedStyle(e).overflowX==='auto'&&e.scrollWidth>e.clientWidth+1).map(e=>e.className),title:document.querySelector('h1')?.getBoundingClientRect().width}));
 await page.screenshot({path:`${out}/${mode}-${width}.png`,fullPage:false});results.push({mode,width,...metric});
 if(mode==='editor'){
 await page.getByRole('button',{name:'開く',exact:true}).first().click();await page.locator('input[name="splatItems.0.label"]').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${out}/${mode}-${width}-expanded.png`});
 const escaped=await page.evaluate(()=>[...document.querySelectorAll('#root *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}).map(e=>e.className));
 results.push({mode:'editor-expanded',width,overflow:escaped.length>0,scrollers:[],escaped});
 for(const step of ['01 基本情報','02 仕様・設備','03 利用条件','04 料金','05 写真','07 公開設定']){
 await page.getByRole('button',{name:step}).click();
 const escaped=await page.evaluate(()=>[...document.querySelectorAll('#root *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}).map(e=>e.className));
 results.push({mode:step,width,overflow:escaped.length>0,scrollers:[],escaped});
 }
 }
 }
 }
}finally{await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(results);if(results.some(r=>r.overflow||r.scrollers.length))throw Error('Admin layout overflows or requires horizontal scrolling');
