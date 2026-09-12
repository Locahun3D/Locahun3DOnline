import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base=(process.env.BASE_URL||'http://localhost:3032').replace(/\/$/,'');
const out=process.env.OUT_DIR||new URL('../artifacts/pricing-demo-bounds/',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
const results=[];
try{
 const page=await browser.newPage();
 for(const en of [false,true])for(const width of [320,390,820,1440]){
  await page.setViewportSize({width,height:1000});
  await page.goto(`${base}/${en?'en/':''}pricing`,{waitUntil:'networkidle'});
  const heading=page.getByRole('heading',{name:en?'Try walking through it first.':'まず、歩いてみてください。',exact:true});
  await heading.scrollIntoViewIfNeeded();
  const lines=await heading.evaluate(h=>{
   const walker=document.createTreeWalker(h,NodeFilter.SHOW_TEXT),rows=new Map();
   while(walker.nextNode()){const node=walker.currentNode;for(let i=0;i<node.textContent.length;i++){
    const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
    const top=Math.round(range.getBoundingClientRect().top);rows.set(top,(rows.get(top)||'')+node.textContent[i]);
   }}return [...rows.values()];
  });
  const bounds=await heading.evaluate(h=>{
   const grid=h.parentElement.parentElement,box=grid.getBoundingClientRect();
   return {grid:{left:box.left,right:box.right},children:[...grid.children].map(c=>{const b=c.getBoundingClientRect();return {left:b.left,right:b.right,scroll:c.scrollWidth,client:c.clientWidth}})};
  });
  await page.screenshot({path:`${out}/${en?'en':'ja'}-${width}.png`});
  results.push({en,width,lines,...bounds});
  if(bounds.children.some(c=>c.left<bounds.grid.left-1||c.right>bounds.grid.right+1||c.scroll>c.client+1))throw Error(`Demo child exceeds card bounds: ${JSON.stringify(results.at(-1))}`);
  if(!en&&width===320&&!lines.some(line=>line.includes('歩いてみてください。')))throw Error(`Japanese phrase is split at 320px: ${JSON.stringify(lines)}`);
 }
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));
