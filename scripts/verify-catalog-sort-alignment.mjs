import fs from 'node:fs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const out=process.env.OUT_DIR||'F:/Codex/catalog-sort-20260913';fs.mkdirSync(out,{recursive:true});
const base=process.env.BASE_URL||'http://localhost:3032';
const built=await build({bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from 'react';import{createRoot}from'react-dom/client';import Catalog from './src/components/properties/catalog-client';import{propertySchema}from './src/lib/schemas';const items=['A','B','C'].map((title,i)=>propertySchema.parse({id:title,title,category:'studio',status:'published',updatedAt:'2026-09-0'+(i+1)+'T00:00:00Z',hourlyPrice:(i+1)*10000,dailyPrice:(i+1)*30000,ceilingHeightM:i+3,coords:{lat:35.66+i*.1,lng:139.70},cover:{src:'https://locahun3d.com/api/r2/assets/image/NbJ-IS95yS-shibuya-scramble-crossing-5_large.jpg',alt:'Fixture'},splatItems:[]}));createRoot(document.getElementById('root')).render(<Catalog items={items} areas={[]} studioTypes={[]} />);`},plugins:[{name:'safe-external-boundaries',setup(b){b.onResolve({filter:/^\.\/catalog-map$/},a=>({path:a.path,namespace:'stub'}));b.onResolve({filter:/^(next\/|@\/components\/(bookmark-button|locale-provider)$)/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({resolveDir:process.cwd(),loader:'jsx',contents:a.path==='next/link'?'export default function Link({children,...props}){return <a {...props}>{children}</a>}':a.path==='next/dynamic'?'export default ()=>()=>null;':a.path==='next/navigation'?'export const useRouter=()=>({push(){},refresh(){}});':a.path.endsWith('locale-provider')?'export const useLocale=()=>window.locale;':'export default ()=>null;'}));}}]});
const browser=await chromium.launch({channel:'chrome',headless:false});const results=[];
try{const p=await browser.newPage();for(const locale of ['ja','en'])for(const width of [320,390,820,1440]){
 await p.setViewportSize({width,height:900});await p.goto(base+(locale==='en'?'/en':'')+'/properties',{waitUntil:'networkidle'});
 const liveSort=p.getByRole('button',{name:locale==='en'?'New':'新',exact:true}).locator('..').locator('..').locator('..').locator('..');
 await liveSort.scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/live-${locale}-${width}.png`});
 const links=await p.locator('link[rel=stylesheet]').evaluateAll(ns=>ns.map(n=>n.href));const css=(await Promise.all(links.map(async u=>(await p.request.get(u)).text()))).join('\n');
 const header=await p.locator('header').first().evaluate(e=>e.outerHTML);
 await p.goto('about:blank');await p.setContent(`<html><head><style>${css}</style></head><body>${header}<main class="theme-online frame"><h1>Sort verification fixture</h1><div id="root"></div></main></body></html>`);
 await p.evaluate(locale=>{window.locale=locale;window.fetch=()=>{throw Error('Fixture forbids network writes');}},locale);await p.addScriptTag({content:built.outputFiles[0].text});
 const newest=p.getByRole('button',{name:locale==='en'?'New':'新',exact:true});await newest.waitFor();
 const axes=newest.locator('..').locator('..').locator('..');const bar=axes.locator('..');const errors=[];
 const geometry=await axes.evaluate(el=>[...el.children].map(axis=>{const pair=axis.lastElementChild,button=pair.querySelector('button'),separator=pair.querySelector('span');const center=e=>{const r=document.createRange();r.selectNodeContents(e);const box=r.getBoundingClientRect();return (box.top+box.bottom)/2;};return{label:axis.firstElementChild.textContent,delta:Math.abs(center(button)-center(separator)),height:button.getBoundingClientRect().height};}));
 if(geometry.some(g=>g.delta>3))errors.push('Separator floats above button text');
 if(width<720&&geometry.some(g=>g.height<44))errors.push('Mobile tap target below 44px');
 await bar.scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/${locale}-${width}.png`});
 const expectations=[['C','B','A'],['A','B','C'],['A','B','C'],['C','B','A'],['A','B','C'],['C','B','A'],['C','B','A'],['A','B','C'],['A','B','C'],['C','B','A']];
 const buttons=axes.locator('button');for(let i=0;i<10;i++){await buttons.nth(i).click();const order=await p.locator('[data-property-grid] h3').allTextContents();if(JSON.stringify(order)!==JSON.stringify(expectations[i]))errors.push('Sort axis '+i+' returned '+order.join(','));}
 results.push({locale,width,geometry,errors});console.log(locale,width,errors.length?errors:'PASS');
}}finally{await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));}if(results.some(r=>r.errors.length))process.exitCode=1;
