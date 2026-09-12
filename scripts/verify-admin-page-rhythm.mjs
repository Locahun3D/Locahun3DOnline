import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {build} from 'esbuild';
import {chromium} from 'playwright';

// Local, read-only fixtures: render real page JSX; replace server reads/actions
// and unrelated nested panels. Never change authentication or send mutations.
const out='F:/Codex/admin-page-rhythm-20260912';
fs.mkdirSync(out,{recursive:true});
const routes=['dashboard','dashboard/bookmarks','dashboard/purchases','dashboard/unlocked','account/upgrade','admin/accounts','admin/assets','admin/properties','admin/inquiries','admin/contact-requests','admin/submissions','admin/reports','admin/marketing','admin/purchases','admin/payouts','admin/analytics','admin/accounts/[id]/sessions','admin/accounts/[id]/tokens','admin/submissions/[id]','admin/properties/[id]/page'];
const user={id:'fixture',email:'fixture@example.test',name:'表示確認ユーザー',role:'individual',status:'active',plan:'free',bookmarks:[],tokenBalance:0,bonusTokens:0,createdAt:'2026-09-01T00:00:00Z'};
const keep=/^@\/lib\/(schemas|account-schema|date-format|i18n\/dictionaries|asset-usage|free-email-domains|payout-schema|scan-submissions-schema|settings-schema|publish-readiness|property-write-queue|published-english-updates|license-options)$/;
const results=process.argv[2]&&fs.existsSync(path.join(out,'results.json'))?JSON.parse(fs.readFileSync(path.join(out,'results.json'),'utf8')).filter(r=>!process.argv[2].split(',').includes(r.route)):[];
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>console.error('BROWSER',e.message));
 await page.goto('http://localhost:3032/sign-in',{waitUntil:'networkidle'});
 const styles=await page.locator('link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.href));
 const css=(await Promise.all(styles.map(async u=>(await page.request.get(u)).text()))).join('\n');
 for(const route of [...routes,'account-component','subscription-component','editor-component'].filter(r=>!process.argv[2]||process.argv[2].split(',').includes(r))){
  const special=route.endsWith('-component');
  const entry=route==='account-component'?'src/components/account/account-dashboard.tsx':route==='subscription-component'?'src/components/admin/subscription-summary.tsx':route==='editor-component'?'src/components/admin/property-editor.tsx':`src/app/${route}/page.tsx`;
  try{
   const result=await build({bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"'},stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './${entry}';import{propertySchema}from './src/lib/schemas';const props=${JSON.stringify({user,boardTiles:[],totalBoardCount:0,lastUnlock:null,lastUnlockProperty:null,lastUnlockSceneLabel:'',unlockedCount:0,nowIso:'2026-09-12T00:00:00Z'})};props.locale=window.fixtureLocale;props.searchParams=Promise.resolve({});props.params=Promise.resolve({id:'fixture'});props.initial=propertySchema.parse({id:'fixture',title:'表示確認用のスタジオ',category:'studio',cover:{}});async function mount(){const node=${special&&route!=='subscription-component'?'<Page {...props}/>':'await Page(props)'};createRoot(document.getElementById('root')).render(${special?'<div className="theme-online frame ui-page-shell">{node}</div>':'node'});}mount();`},plugins:[{name:'safe-fixtures',setup(b){
    b.onResolve({filter:/^(?:@\/|next\/|\.\.\/.*actions)/},a=>{
     if(keep.test(a.path))return;
     if(a.path==='@/components/account/display-name-editor')return;
     if(!a.path.startsWith('@/lib/')&&!a.path.startsWith('@/components/')&&!a.path.startsWith('next/')&&!a.path.includes('actions'))return;
     const source=ts.createSourceFile(a.importer,fs.readFileSync(a.importer,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
     const names=[];for(const s of source.statements){if(ts.isImportDeclaration(s)&&s.moduleSpecifier.text===a.path){const bs=s.importClause?.namedBindings;if(bs&&ts.isNamedImports(bs))for(const e of bs.elements)if(!e.isTypeOnly)names.push((e.propertyName??e.name).text)}}
     return{path:a.path,namespace:'stub',suffix:'?'+encodeURIComponent(a.importer),pluginData:{names:[...new Set(names)]}};
    });
    b.onLoad({filter:/.*/,namespace:'stub'},a=>{
     const value=n=>/Repo$/.test(n)||n==='repo'?'fixtureRepo':/getCurrentUser|requireAdmin|requireOnboarded/.test(n)?'async()=>user':n==='filterAdminPurchases'?'x=>x':n==='getLocale'?'async()=>window.fixtureLocale':n==='withLiveDisplayNames'?'async x=>x':n==='stripeConfigStatus'?'()=>({enabled:false})':n==='useRouter'?'()=>({refresh(){},push(){},replace(){}})':n==='usePathname'?"()=>'/account'":n==='emailEnabled'?'()=>false':n==='getPublishedProperties'||n==='listActiveSessions'?'async()=>[]':/^[A-Z_]+$/.test(n)?'[]':'()=>[]';
     return{loader:'jsx',resolveDir:process.cwd(),contents:`const user=${JSON.stringify(user)};const fixtureRepo={list:async()=>[],listAll:async()=>[],get:async()=>({...user,locationName:'表示確認用の申請',status:'submitted',title:'表示確認用のスタジオ',category:'studio',gallery:[],splatItems:[],pageBlocks:[],attachments:[],sampleImages:[]})};export default function Empty({children,...props}){return ${a.path==='next/link'?'<a {...props}>{children}</a>':'null'}};${a.pluginData.names.map(n=>`export const ${n}=${value(n)};`).join('\n')}`};
    });
   }}]});
   for(const locale of ['ja','en'])for(const width of [1440,820,390]){
    await page.goto('about:blank');await page.setViewportSize({width,height:1000});
    await page.setContent(`<!doctype html><html lang="${locale}"><head><style>${css}</style></head><body class="theme-online"><div id="root"></div></body></html>`);
    await page.evaluate(l=>{window.fixtureLocale=l;window.fetch=()=>{throw Error('No network allowed in fixture')}},locale);
    await page.addScriptTag({content:result.outputFiles[0].text});
    await page.locator('h1').first().waitFor({timeout:7000});
    const metric=await page.locator('h1').first().evaluate(el=>({title:el.textContent,size:getComputedStyle(el).fontSize,line:getComputedStyle(el).lineHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}));
    const filename=`${route.replaceAll('/','-').replaceAll('[','').replaceAll(']','')}-${locale}-${width}.png`;
    await page.screenshot({path:path.join(out,filename),fullPage:false});
    results.push({route,locale,width,...metric});
   }
  }catch(e){results.push({route,error:e.message});console.error(route,e.message.slice(0,180));}
 }
}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));
if(results.some(r=>r.error||r.overflow||r.size!==(r.width===1440?'60px':'42px')))throw Error('Page rhythm fixture failed; inspect results.json');
