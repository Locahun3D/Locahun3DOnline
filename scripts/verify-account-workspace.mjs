import fs from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Real page and child JSX, isolated data/action boundaries. Never authenticates or writes APIs.
const out = 'artifacts/account-workspace';
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL || 'http://localhost:3032';
const scenarios = ['individual-empty', 'production-long', 'studio-boards', 'admin-paid', 'production-expired'];
const bundle = await build({ bundle:true,write:false,outdir:'fixture',format:'esm',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"'},stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/app/account/page';createRoot(document.getElementById('root')).render(<main className="flex flex-col min-h-screen">{await Page({searchParams:Promise.resolve({})})}</main>);`},plugins:[{name:'safe-fixture',setup(b){
  b.onResolve({filter:/^(?:@clerk\/|next\/|@\/lib\/(?:dal|device-limit|view-unlocks|properties|store|stripe|notifications|.*-actions|i18n\/server)$|@\/components\/locale-provider$)/},a=>({path:a.path,namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},a=>{
    const p=a.path;let contents='';
    if(p==='next/link')contents='export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}';
    else if(p==='next/navigation')contents='export const useRouter=()=>({refresh(){},push(){}});export const usePathname=()=>"/account";export const redirect=()=>{};';
    else if(p.startsWith('@clerk/'))contents='export const auth=async()=>({sessionId:"current"});export const SignOutButton=({children})=>children;';
    else if(p.endsWith('/dal'))contents='export const requireOnboarded=async()=>window.fixture.user;';
    else if(p.endsWith('/device-limit'))contents='export const listActiveSessions=async()=>window.fixture.sessions;export const deviceLimitForPlan=()=>2;';
    else if(p.endsWith('/view-unlocks'))contents='export const viewUnlockRepo={list:async()=>window.fixture.unlocks};';
    else if(p.endsWith('/properties'))contents='export const getPublishedProperties=async()=>window.fixture.properties;';
    else if(p.endsWith('/store'))contents='export const repo={list:async()=>window.fixture.properties,get:async(id)=>window.fixture.properties.find(p=>p.id===id)};';
    else if(p.endsWith('/stripe'))contents='export const getSubscriptionBilling=async()=>({interval:"annual",periodEnd:"2027-09-12T00:00:00Z"});';
    else if(p.endsWith('/notifications'))contents='export const getNotificationSummary=async(id,scope)=>({notifications:scope==="user"?window.fixture.notices:[],unreadCount:scope==="user"?2:7});';
    else if(p.endsWith('/server'))contents='export const getLocale=async()=>window.fixture.locale;';
    else if(p.endsWith('/locale-provider'))contents='export const useLocale=()=>window.fixture.locale;';
    else if(p.endsWith('-actions'))contents=`const record=(name,...args)=>{window.fixtureCalls.push({name,args:args.map(v=>v instanceof FormData?Object.fromEntries(v):v)})};export const updateDisplayNameAction=async(s,f)=>{record('displayName',f);return{ok:true,displayName:f.get('displayName')}};export const revokeMySessionAction=async(f)=>record('revoke',f);export const acceptNdaAction=async()=>record('nda');export const openBillingPortalAction=async()=>record('billing');export const updateMarketingConsentAction=async(v)=>record('marketing',v);export const markNotificationsReadAction=async(scope)=>{record('read',scope);if(window.failRead)throw Error('Fixture read failure')};export const redeemGiftCodeAction=async(s,f)=>{record('gift',f);return{ok:false,error:'Fixture: no gift code redeemed'}};`;
    else throw Error('Unmocked boundary '+p);
    return{contents,loader:'jsx',resolveDir:process.cwd()};
  });
}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const moduleCss=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
const browser=await chromium.launch({channel:'chrome',headless:false});
const results=[];
try{
  const page=await browser.newPage();
  await page.goto(base+'/contact',{waitUntil:'networkidle'});
  const links=await page.locator('link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.href));
  const css=(await Promise.all(links.map(async u=>(await page.request.get(u)).text()))).join('\n');
  for(const locale of ['ja','en'])for(const width of [1440,820,390,320])for(const scenario of scenarios){
    const role=scenario.split('-')[0],empty=scenario.includes('empty'),long=scenario.includes('long'),expired=scenario.includes('expired'),paid=scenario.includes('paid');
    const user={id:'fixture',role,status:'active',plan:paid?'pro':'free',displayName:long?(locale==='ja'?'長い表示名の制作会社映像企画担当者確認用':'AlexandertheLongDisplayNameTest'):(locale==='ja'?'確認ユーザー':'Fixture User'),name:'Fixture',email:long?'production.location.management.department@long-company-domain.example.test':'test@company.example.test',company:long?'株式会社 映像制作とロケーション企画管理部門':'確認制作会社',bookmarks:empty?[]:['p1','p2','p3'],bookmarkFolders:[{id:'b1',name:'長い保存ボード名ロケーション候補リスト'},{id:'b2',name:'Commercial production shortlist'}],bookmarkFolderAssignments:{p1:'b1',p2:'b2'},tokenBalance:6,bonusTokens:2,purchasedTokens:0,marketingConsent:false,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-09-12T00:00:00Z',stripeCustomerId:paid?'safe-fixture-customer':undefined,ndaAcceptedAt:paid?'2026-01-01T00:00:00Z':undefined};
    const properties=['p1','p2','p3'].map(id=>({id,ownerId:'fixture',title:'ロケーション候補・長い物件名確認用',status:'published',splatItems:[{id:'scene',label:'Main scene'}]}));
    const fixture={locale,user,properties,unlocks:empty?[]:[{propertyId:'p1',splatItemIndex:0,unlockedAt:'2026-09-12T00:00:00Z',expiresAt:expired?'2020-01-01T00:00:00Z':'2099-01-01T00:00:00Z'}],sessions:empty?[]:[{id:'current',browserName:'Chrome',lastActiveAt:Date.now(),city:'Tokyo',country:'Japan'},{id:'other',browserName:'Safari',deviceType:'Desktop',lastActiveAt:Date.now()}],notices:[1,2].map(id=>({id:'u'+id,userId:'fixture',type:'inquiry_reply',title:'本人向け返信 / Personal inquiry reply',body:'本人向けの返信です。',read:false,createdAt:'2026-09-12T00:00:00Z'}))};
    if(paid)user.plan='team';
    for(const n of fixture.notices)n.link='/contact/inquiries/fixture';
    if(empty)fixture.notices=[];
    else fixture.notices[0].body='本人向けの詳しい返信 / Full personal reply. '.repeat(12);
    await page.goto('about:blank');await page.setViewportSize({width,height:width<500?844:900});
    await page.setContent(`<!doctype html><html lang="${locale}"><head><style>${css}\n${moduleCss}</style></head><body><div id="root"></div></body></html>`);
    const runtime=[];const onError=e=>runtime.push(e.message);page.on('pageerror',onError);
    await page.evaluate(f=>{window.fixture=f;window.fixtureCalls=[];window.fetch=()=>{throw Error('Network forbidden in fixture')};},fixture);
    await page.addScriptTag({type:'module',content:js});await page.locator('h1').waitFor();
    const errors=[];
    const geometry=await page.evaluate(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
      const regions=Object.fromEntries([...document.querySelectorAll('[data-account-region]')].map(e=>[e.dataset.accountRegion,rect(e)]));
      const slots=Object.fromEntries([...document.querySelectorAll('[data-account-slot]')].map(e=>[e.dataset.accountSlot,{...rect(e),region:e.parentElement.closest('[data-account-region]')?.dataset.accountRegion}]));
      const escaped=[...document.querySelectorAll('#root *')].filter(e=>{if(!e.getClientRects().length||getComputedStyle(e).position==='absolute'||getComputedStyle(e).position==='fixed')return false;const r=e.getBoundingClientRect(),p=e.parentElement?.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1||(p&&(r.left<p.left-1||r.right>p.right+1)));}).map(e=>({tag:e.tagName,text:e.textContent.slice(0,70),...rect(e)}));
      return{regions,slots,escaped,scrollWidth:document.documentElement.scrollWidth};
    });
    for(const name of ['work','subscription','contracts','profile'])if(!geometry.regions[name])errors.push('Missing region '+name);
    for(const [slot,region]of Object.entries({saved:'work',history:'work',devices:'work',tokens:'subscription',plan:'subscription',invoices:'subscription',nda:'contracts',gift:'contracts'}))if(geometry.slots[slot]?.region!==region)errors.push('Wrong/missing slot '+slot);
    if(geometry.escaped.length)errors.push('Parent/viewport overflow');
    const w=geometry.regions.work,s=geometry.regions.subscription,c=geometry.regions.contracts;
    if(w&&s&&width===1440&&!(w.x<s.x&&Math.abs(w.y-s.y)<3))errors.push('Desktop work/sidebar not aligned');
    if(w&&s&&width===320&&!(w.y<s.y))errors.push('Mobile work not first');
    if(w&&s&&c&&c.y<Math.max(w.bottom,s.bottom)-2)errors.push('Contracts not below workspace');
    const key=`${locale}-${width}-${scenario}`;
    await page.screenshot({path:`${out}/${key}-initial.png`});await page.screenshot({path:`${out}/${key}-full.png`,fullPage:true});
    if(expired&&await page.locator('a[href$="/properties/p1"]').count())errors.push('Expired unlock revisit shown');
    const summary=page.locator('details summary');
    const adminLink=page.locator('a[href$="/admin/notifications"]');
    if(role==='admin' ? !(await adminLink.innerText()).includes('7') : await adminLink.count())errors.push('Admin notification scope wrong');
    if(!empty){
    if(!(await summary.innerText()).includes('2'))errors.push('Personal unread count missing');
    await summary.click();await page.locator('#notifications').waitFor({state:'visible'});
    if(!(await page.locator('#notifications').innerText()).includes('Personal inquiry reply'))errors.push('Personal notices missing');
    const body=page.locator('#notifications .line-clamp-2').first();
    if(await body.evaluate(e=>e.scrollHeight>e.clientHeight+1))errors.push('Notification body clipped');
    await page.screenshot({path:`${out}/${key}-notifications.png`});
    await page.evaluate(()=>{window.failRead=true;});
    await page.getByRole('button',{name:locale==='en'?'Mark all read':/すべて既読/}).click();
    await page.getByRole('alert').waitFor();
    if(!(await summary.innerText()).includes('2'))errors.push('Failed read erased summary count');
    await summary.click();
    await page.evaluate(()=>{location.hash='notifications';});
    await page.waitForTimeout(100);
    if(!(await page.locator('details').evaluate(e=>e.open)))errors.push('Notification fragment remains collapsed');
    await page.locator('details').evaluate(e=>{e.open=false;});
    }else if(await summary.count())errors.push('Empty notification panel rendered');
    await page.getByRole('button',{name:locale==='en'?'Edit display name':'表示名を変更',exact:true}).click();
    await page.locator('input[name="displayName"]').fill('QA updated');
    await page.locator('input[name="displayName"]').evaluate(e=>e.form.requestSubmit());
    await page.getByRole('heading',{name:'QA updated',exact:true}).waitFor();
    await page.locator('input[name="code"]').fill('LH3D-QA-ONLY');
    await page.locator('input[name="code"]').evaluate(e=>e.form.requestSubmit());
    await page.getByText('Fixture: no gift code redeemed',{exact:true}).waitFor();
    if(!empty){await page.locator('input[name="sessionId"][value="other"]').evaluate(e=>e.form.requestSubmit());}
    if(role==='production'){
      await page.getByRole('button',{name:locale==='en'?'Agree to NDA →':'NDAに同意する →',exact:true}).click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('dialog').getByRole('checkbox').check();
      await page.getByRole('dialog').locator('button').last().click();
    }
    const calls=await page.evaluate(()=>window.fixtureCalls);
    for(const action of ['displayName','gift',...(!empty?['revoke']:[]),...(role==='production'?['nda']:[])])if(!calls.some(c=>c.name===action))errors.push('Safe action missing '+action);
    results.push({locale,width,scenario,calls,errors:[...errors,...runtime],...geometry});page.off('pageerror',onError);
  }
}finally{await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify({cases:results.length,failures:results.filter(r=>r.errors.length).map(({locale,width,scenario,errors,escaped})=>({locale,width,scenario,errors,escaped}))},null,2));
if(results.some(r=>r.errors.length))process.exitCode=1;
