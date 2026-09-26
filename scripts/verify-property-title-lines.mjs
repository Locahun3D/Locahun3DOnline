import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {chromium} from 'playwright';

function tree(file){return ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
function find(root,predicate){let found;function visit(n){if(!found&&predicate(n))found=n;ts.forEachChild(n,visit);}visit(root);assert(found);return found;}
const editor=tree('src/components/admin/property-editor.tsx');
const inputClass=find(editor,n=>ts.isVariableDeclaration(n)&&n.name.getText(editor)==='inputClass').initializer.text;
const fields=['title','titleEn'].map(name=>{
 const node=find(editor,n=>ts.isJsxSelfClosingElement(n)&&n.attributes.getText(editor).includes(`register("${name}")`));
 assert.equal(node.tagName.getText(editor),'textarea');
 return `<label>${name==='title'?'物件名':'English title'}<textarea name="${name}" rows="2" class="${inputClass}"></textarea></label>`;
}).join('');
const detail=tree('src/components/property-detail-view.tsx');
const heading=find(detail,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(detail)==='h1'&&n.getText(detail).includes('property.title'));
const titleClass=heading.openingElement.attributes.properties.find(a=>a.name?.getText(detail)==='className').initializer.text;
const browser=await chromium.launch({channel:'chrome',headless:false});
const out='F:/Codex/locahun-title-lines';fs.mkdirSync(out,{recursive:true});
try{
 const page=await browser.newPage();
 await page.goto('http://localhost:3032/sign-in',{waitUntil:'networkidle'});
 const styles=await page.locator('link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(n=>n.href));assert(styles.length);
 await page.route('**/__title-lines-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ja"><head><meta charset="utf-8">${styles.map(h=>`<link rel="stylesheet" href="${h}">`).join('')}<style>body{margin:0;padding:28px;background:#151a1d;color:#fff}main{max-width:336px}label{display:block;margin-bottom:20px}h1{max-width:100%}</style></head><body><main>${fields}<h1 class="${titleClass}"></h1></main><script>const field=document.querySelector('[name=title]');field.addEventListener('input',()=>document.querySelector('h1').textContent=field.value);</script></body></html>`}));
 for(const width of [1440,820,390]){
  await page.setViewportSize({width,height:900});await page.goto('http://localhost:3032/__title-lines-fixture');
  const field=page.locator('[name=title]');await field.fill('Studio');await field.press('End');await field.press('Enter');await field.pressSequentially('SeeYouTomorrow');
  await page.locator('[name=titleEn]').fill('Studio\nSee You Tomorrow');
  assert.equal(await field.inputValue(),'Studio\nSeeYouTomorrow');
  const state=await page.locator('h1').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return {text:el.textContent,whiteSpace:getComputedStyle(el).whiteSpace,lines:new Set([...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top))).size,width:el.clientWidth,scroll:el.scrollWidth};});
  await page.screenshot({path:`${out}/title-${width}.png`});
  assert.equal(state.text,'Studio\nSeeYouTomorrow');assert.equal(state.whiteSpace,'pre-wrap');assert.equal(state.lines,2,JSON.stringify(state));assert(state.scroll<=state.width+1);
  await field.fill('A'.repeat(120));assert(await page.locator('h1').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 }
 console.log('PASS actual title field/tag/classes with app CSS: Enter, EN, 1440/820/390, long-title overflow. Isolated UI fixture; no admin save or production data write.');
}finally{await browser.close();}
