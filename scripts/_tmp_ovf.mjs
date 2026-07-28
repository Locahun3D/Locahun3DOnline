import { chromium } from "playwright";
const b=await chromium.launch({headless:false, channel:"chrome"});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();
await p.goto("https://web.locahun3d.com/works/isaacsim-3dgs-import.html",{waitUntil:"domcontentloaded",timeout:45000});
await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>{
  const cw=document.documentElement.clientWidth;
  const out=[];
  document.querySelectorAll('*').forEach(e=>{
    const r=e.getBoundingClientRect();
    if(r.width>cw+2 && r.width>0){
      // 祖先が overflow 制御していれば除外
      let anc=e.parentElement,clipped=false;
      while(anc){const o=getComputedStyle(anc).overflowX;if(o==='auto'||o==='hidden'||o==='scroll'){clipped=true;break;}anc=anc.parentElement;}
      if(!clipped) out.push(`${e.tagName}.${String(e.className).slice(0,40)} w=${Math.round(r.width)} (画面${cw})`);
    }
  });
  return [...new Set(out)].slice(0,8).join('\n') || 'なし';
}));
await b.close();
