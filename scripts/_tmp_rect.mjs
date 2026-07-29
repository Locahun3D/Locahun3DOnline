import { chromium } from "playwright";
const b=await chromium.launch({headless:false, channel:"chrome"});
const probe=async(url,w,h)=>{
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  const p=await ctx.newPage();
  await p.route('**/*', r=>r.continue({headers:{...r.request().headers(),'cache-control':'no-cache'}}));
  await p.goto(url+(url.includes('?')?'&':'?')+'cb='+Math.random(),{waitUntil:"domcontentloaded",timeout:45000}).catch(()=>{});
  await p.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))])).catch(()=>{});
  await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>{
    const hd=document.querySelector('.site-header')||document.querySelector('header');
    const R=e=>{if(!e)return null;const q=e.getBoundingClientRect();return {w:+q.width.toFixed(1),h:+q.height.toFixed(1)};};
    const tg=hd.querySelector('.sh-toggle:not(.sh-lang)') || [...hd.querySelectorAll('div')].find(d=>/^スキャン/.test(d.textContent||''));
    const cell=[...hd.querySelectorAll('a,span')].find(e=>/^スキャン$|^Scan$/.test((e.textContent||'').trim()));
    const hb=hd.querySelector('.sh-hb, button[aria-label*="メニュー"], button[aria-label*="Menu"]');
    const bt=hd.querySelector('.sh-brand-text') || hd.querySelector('.brand');
    const en=[...hd.querySelectorAll('a')].find(e=>/^EN$|^JA$/.test((e.textContent||'').trim()));
    return {トグル全体:R(tg), スキャンセル:R(cell), ハンバーガー:R(hb), ブランド文字:R(bt),
            EN:en?{...R(en), x:Math.round(en.getBoundingClientRect().left)}:'非表示',
            zoom:getComputedStyle(hd).zoom, htmlZoom:getComputedStyle(document.documentElement).zoom};
  });
  await ctx.close(); return r;
};
for (const [n,w,h] of [["390縦",390,844],["820縦",820,1180],["1440",1440,900]]) {
  const o=await probe("https://locahun3d.com/properties",w,h);
  const s=await probe("https://web.locahun3d.com/locahun3d_manifesto.html",w,h);
  console.log(`\n=== ${n} ===`);
  for(const k of Object.keys(o)) console.log(`  ${k.padEnd(10)} online=${JSON.stringify(o[k])}  scan=${JSON.stringify(s[k])}`);
}
await b.close();
