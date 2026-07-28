import { chromium } from "playwright";
const W=[720,744,768,810,820,834,1023,1024,1080,1133,1180,1194,1199,1200,1280,1366,1440,1535,1536,1680,1920];
const b = await chromium.launch();
const grab = async (base,path) => {
  const out={};
  const ctx = await b.newContext({ viewport:{width:800,height:800} });
  const p = await ctx.newPage();
  for (const w of W) {
    await p.setViewportSize({width:w,height:800});
    await p.goto(base+path,{waitUntil:"domcontentloaded",timeout:40000}).catch(()=>{});
    await p.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2000))])).catch(()=>{});
    await p.waitForTimeout(400);
    out[w]= await p.evaluate(() => {
      const hd=document.querySelector('.site-header')||document.querySelector('header');
      const brand=hd.querySelector('.sh-brand')||hd.querySelector('a[aria-label]');
      const r=brand.getBoundingClientRect();
      const els=[...hd.querySelectorAll('a,button')].map(e=>({e,q:e.getBoundingClientRect(),t:(e.textContent||e.getAttribute('aria-label')||'?').trim().slice(0,8)})).filter(o=>o.q.width>3&&o.q.height>3);
      const ov=[];
      for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){
        const a=els[i],c=els[j]; if(a.e.contains(c.e)||c.e.contains(a.e))continue;
        if(Math.min(a.q.right,c.q.right)-Math.max(a.q.left,c.q.left)>1 && Math.min(a.q.bottom,c.q.bottom)-Math.max(a.q.top,c.q.top)>1) ov.push(`${a.t}×${c.t}`);
      }
      return {c:+((r.left+r.right)/2).toFixed(1), vc:window.innerWidth/2, ov:[...new Set(ov)],
              of:document.documentElement.scrollWidth-window.innerWidth};
    });
  }
  await ctx.close(); return out;
};
// 反映待ち: online の中央グリッドが全帯に効いているか（1366でズレ0か）で判定
let ok=false;
for (let i=0;i<14;i++){
  const t=await grab("https://locahun3d.com","/"); 
  if (t[1366] && Math.abs(t[1366].c-t[1366].vc)<2) { ok=true; console.log(`反映確認 (${i+1}回目)`); break; }
  console.log(`未反映 ${i+1}/14 …`); await new Promise(s=>setTimeout(s,30000));
}
const on=await grab("https://locahun3d.com","/properties");
const sc=await grab("https://web.locahun3d.com","/locahun3d_manifesto.html");
let ng=0;
console.log("幅   | online ズレ/重なり/はみ出し | scan ズレ/重なり/はみ出し | 両サイト差");
for (const w of W) {
  const a=on[w],c=sc[w];
  const f=o=>`${(o.c-o.vc>=0?'+':'')}${(o.c-o.vc).toFixed(1)} ${o.ov.length?'重'+o.ov.join(','):'重0'} of${o.of}`;
  if(Math.abs(a.c-a.vc)>1||a.ov.length||Math.abs(c.c-c.vc)>1||c.ov.length) ng++;
  console.log(`${String(w).padStart(4)} | ${f(a).padEnd(26)} | ${f(c).padEnd(26)} | ${Math.abs(a.c-c.c).toFixed(1)}`);
}
console.log(ng?`\n✘ ${ng}幅で問題`:"\n✔ 本番: 全幅で中央一致・重なり0");
await b.close();
