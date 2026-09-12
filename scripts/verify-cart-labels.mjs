import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const out=new URL('../artifacts/cart-labels/',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage({viewport:{width:390,height:1000}});
 const title='渋谷スクランブル交差点';
 for(const label of [title,`  ${title}  `,'']){
  await page.goto('http://localhost:3032/cart',{waitUntil:'networkidle'});
  // Browser-local display fixture only; IDs resolve to real local test items.
  await page.evaluate(({title,label})=>localStorage.setItem('locahun3d:cart:v1',JSON.stringify([
   {propertyId:'wh-002',splatItemIndex:0,title,label,price:150000,license:'standard'},
   {propertyId:'wh-002',splatItemIndex:1,title,label:'2F スタジオ',price:150000,license:'extended'},
  ])),{title,label});
  await page.reload({waitUntil:'networkidle'});
  const cards=page.getByRole('region',{name:'カートの商品',exact:true});
  await cards.first().waitFor();
  const firstHeading=cards.first().getByRole('link',{name:title,exact:true});
  await firstHeading.waitFor();
  const visibleTitleCount=(await cards.first().innerText()).split(title).length-1;
  if(visibleTitleCount!==1)throw Error('Duplicate title label must be omitted, including surrounding whitespace');
  if(!(await cards.nth(1).innerText()).includes('2F スタジオ'))throw Error('Distinct item label was hidden');
  if(label===title)await page.screenshot({path:`${out}/ja-390.png`,fullPage:true});
 }
 console.log('3 duplicate/whitespace/empty cases passed; distinct labels preserved');
}finally{await browser.close();}
