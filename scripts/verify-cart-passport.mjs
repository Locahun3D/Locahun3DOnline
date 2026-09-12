import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://localhost:3032';
const out=process.env.OUT_DIR||'artifacts/cart-passport';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
const results=[];
try {
 for(const en of [false,true]) for(const width of [1440,820,390,320]) for(const count of [1,2]) {
  const page=await browser.newPage({viewport:{width,height:1050}});
  const items=Array.from({length:count},(_,index)=>({propertyId:'fixture-only',splatItemIndex:index,title:en?'Yokohama Industrial Warehouse — a spacious first-floor location with detailed architectural textures':'横浜インダストリアル倉庫｜重厚な質感を残した広い撮影空間と長い物件タイトル',label:index?'2F スタジオ / Second floor studio':'1F / First floor',price:150000,license:index?'extended':'standard'}));
  await page.route('**/api/cart/prices',route=>route.fulfill({json:{items:items.map(i=>({...i,available:true,purchaseContents:[{format:'3DGS RAD',sizeMb:356,kind:'file'},{format:'PLY',sizeMb:1240,kind:'version',date:'2026-09-12'}]}))}}));
  await page.route('**/api/purchase/**',route=>route.abort());
  await page.addInitScript(items=>localStorage.setItem('locahun3d:cart:v1',JSON.stringify(items)),items);
  await page.goto(`${base}/${en?'en/':''}cart`,{waitUntil:'networkidle'});
  const cards=page.getByRole('region',{name:en?'Cart item':'カートの商品',exact:true});
  await cards.first().waitFor();
  const identifier=cards.first().locator('[data-cart-identifier]');
  if(await identifier.count()!==1)throw Error('RED: passport identifier band missing');
  const summary=page.getByRole('region',{name:en?'Order total and checkout':'合計と購入手続き',exact:true});
  const a=await cards.first().boundingBox(),b=await identifier.boundingBox(),d=await cards.first().locator('[data-cart-details]').boundingBox(),s=await summary.boundingBox();
  if(width>=1280&&s.x<a.x+a.width-1)throw Error('Desktop summary must be alongside items');
  if(width<=390&&d.y<b.y+b.height-1)throw Error('Mobile identifier must be above details');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(overflow)throw Error(`Horizontal overflow ${width}`);
  const text=await cards.first().innerText();
  if(!text.includes('356 MB')||!text.includes('1,240 MB')||!text.includes(en?'tax excl.':'税抜'))throw Error('Metadata/tax lost');
  const buy=summary.getByRole('button',{name:en?'Buy all':'まとめて購入',exact:true});
  if(await buy.isEnabled())throw Error('Consent gate lost');
  const before=await buy.boundingBox();await summary.getByRole('checkbox').check();
  if(!await buy.isEnabled()||Math.abs((await buy.boundingBox()).width-before.width)>1)throw Error('Consent/button layout changed');
  await page.screenshot({path:`${out}/${en?'en':'ja'}-${width}-${count}.png`,fullPage:true});
  for(let n=0;n<count;n++)await cards.first().getByRole('button',{name:en?'Remove':'削除',exact:true}).click();
  for(let n=0;n<count;n++)await page.getByRole('button',{name:en?'Undo':'元に戻す',exact:true}).click();
  if(await cards.count()!==count)throw Error('Multi-removal undo failed');
  results.push({en,width,count,pass:true});await page.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(`${results.length} passport cases passed`);
} finally {await browser.close();}
