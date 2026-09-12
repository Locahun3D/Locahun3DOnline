import { chromium } from "playwright";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const out = `${root}artifacts/property-presentation-20260912`;
await mkdir(out, { recursive: true });
// Render the actual page component; stub unrelated interactive widgets only.
// Fixture fields are synthetic and never saved to the property repository.
const result = await build({ stdin: { contents: `
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import View from './src/components/property-detail-view';
import {propertySchema} from './src/lib/schemas';
export function render(en, customTitle) {
 const property=propertySchema.parse({id:'shibuyasq',title:customTitle||(en?'Shibuya Scramble Crossing':'渋谷スクランブル交差点'),category:'outdoor',cover:{src:'',alt:''},contactEmail:'private-owner@example.test',address:'QA fixture address',coords:{lat:35.659,lng:139.7},priceType:'flat',permitRequired:true,permitType:en?'Road use permit':'道路使用許可',permitNotes:en?'Confirm filming requirements with the relevant authority.':'撮影条件を担当窓口で確認してください。',description:'QA fixture',status:'published'});
 return renderToStaticMarkup(<View property={property} others={[]} locale={en?'en':'ja'} />);
}`, resolveDir: root, loader: "tsx" }, bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
plugins: [{name:"isolated-widgets",setup(build){
 build.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:args.path,external:true}));
 build.onResolve({filter:/^@\/components\/(viewer-gate|data-sale-panel|studio\/studio-page-blocks|bookmark-button|inquiry-panel|zoomable-image|property-comments)$/},args=>({path:args.path,namespace:"qa-stub"}));
 build.onLoad({filter:/.*/,namespace:"qa-stub"},()=>({contents:"export default function Widget(){return null}",loader:"js"}));
 build.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"qa-link"}));
 build.onLoad({filter:/.*/,namespace:"qa-link"},()=>({contents:"import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}",loader:"js"}));
}}] });
const compiledModule = {exports:{}};
new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),compiledModule,compiledModule.exports);
const browser = await chromium.launch({ channel:"chrome", headless:false });
const results=[];
try {
 const page=await browser.newPage();
 await page.goto('http://localhost:3032/properties/wh-002',{waitUntil:'networkidle'});
 const styles=await page.locator('link[rel="stylesheet"]').evaluateAll(links=>links.map(l=>l.href));
 for(const en of [false,true]) for(const width of [1440,820,390]) {
  let fixtureTitle;
  await page.setViewportSize({width,height:1000});
  await page.route('**/__property-presentation-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${en?'en':'ja'}"><head><meta charset="utf-8">${styles.map(h=>`<link rel="stylesheet" href="${h}">`).join('')}</head><body>${compiledModule.exports.render(en,fixtureTitle)}</body></html>`}));
  await page.goto('http://localhost:3032/__property-presentation-fixture',{waitUntil:'networkidle'});
  const text=await page.locator('body').innerText();
  if(text.includes('private-owner')||text.includes('RESPONSE WITHIN')||text.includes('道路使用許可について')) throw new Error('Removed public copy still present');
  if(await page.locator('.leaflet-container').count()) throw new Error('Embedded map remains');
  const map=page.getByRole('link',{name:en?'Open in Google Maps':'Google Maps で開く'});
  if(!(await map.getAttribute('href')).includes('35.659%2C139.7')) throw new Error('Map coordinates changed');
  if(!en && await page.getByRole('link',{name:'道路使用許可の申請が必要です',exact:true}).count()!==1) throw new Error('Permit callout is not singular');
  const title=await page.locator('h1').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,segments:[...el.querySelectorAll('span')].map(s=>({text:s.textContent,width:s.getBoundingClientRect().width,top:s.getBoundingClientRect().top}))}));
  if(title.scroll>title.width+1) throw new Error('Title overflow');
  if(!en&&!title.segments.some(s=>s.text==='交差点')) throw new Error('Crossing word split');
  await page.screenshot({path:`${out}/property-${en?'en':'ja'}-${width}.png`,fullPage:true});
  fixtureTitle='Studio\nSeeYouTomorrow'; await page.reload();
  if(!(await page.locator('h1').innerText()).includes('\n')) throw new Error('Explicit title line break lost');
  fixtureTitle='A'.repeat(120); await page.reload();
  if(!(await page.locator('h1').evaluate(el=>el.scrollWidth<=el.clientWidth+1))) throw new Error('Long generic title overflow');
  await page.goto(`http://localhost:3032/${en?'en/':''}contact`,{waitUntil:'networkidle'});
  if((await page.locator('body').innerText()).includes(en?'Please choose the topic':'ご用件をお選びください')) throw new Error('Contact lead remains');
  await page.screenshot({path:`${out}/contact-${en?'en':'ja'}-${width}.png`});
  results.push({en,width,title});
  await page.unroute('**/__property-presentation-fixture');
 }
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));
