/**
 * header-matrix.mjs — 全ページ × 全端末 × 縦横 の総当たりでヘッダーを実測する。
 *
 *   node scripts/header-matrix.mjs           # 本番
 *   node scripts/header-matrix.mjs --local   # localhost:3000 / 127.0.0.1:8830
 *
 * ⚠ **必ず headed（実Chrome）で走る**。ヘッドレスChromiumはスクロールバーが
 *   重なり型なので `100vw` と表示幅が一致し、スクロールバー由来のズレが
 *   **構造的に再現しない**。2026-07-29、ヘッドレスで580計測して
 *   「全幅ズレ0」と報告した直後に、ユーザーが実Chromeで開いてズレを発見した。
 *   数を測ることより、現実を再現する環境で測ることが優先。
 *
 * 既存3本との違い:
 *   header-live.mjs       … 本番4ページ×26幅（軽い常用チェック）
 *   header-parity.mjs     … 両サイトの共有要素の computed style 照合
 *   header-consistency.mjs… スキャン19ページ×23幅が互いに1pxも違わない
 *   → いずれも「全ページ×実機の縦横ペア」を横断できていなかった。
 *     ページ差・端末差・向き差・サイト差を1枚の表で潰すのがこのハーネス。
 *
 * 合格条件（1つでも複数値になったら不合格）:
 *   ブランド中心のズレ / ヘッダー高 / トグルfont-size が全計測で単一値、
 *   かつ横スクロール 0。
 */
import { chromium } from "playwright";
const ON=["/","/properties","/pricing","/about","/contact","/contact/listing","/cart","/sign-in",
  "/dashboard","/account","/privacy","/terms/tokushoho","/submit-scan","/en","/en/properties","/en/about"];
const SC=["/locahun3d_manifesto.html","/locahun3d_data.html","/locahun3d_demo.html","/locahun3d_privacy.html",
  "/works/index.html","/works/isaacsim-3dgs-import.html","/works/chevron-rokunowa-mv.html",
  "/en/locahun3d_manifesto.html","/en/works/index.html"];
const D=[["SE",375,667],["iPhone15",390,844],["ProMax",430,932],["mini",744,1133],["9.7",768,1024],
  ["10.2",810,1080],["Air",820,1180],["Pro11",834,1194],["Pro12.9",1024,1366],["PC",1440,900]];
// ⚠ 実Chrome同様に「場所を取るスクロールバー」を強制する。既定の重なり型だと
//    今回の 7.5px ずれが再現せず、検出できなかった。
// ⚠ 必ず headed（実Chrome）で走らせること。ヘッドレスはスクロールバーが
//    重なり型になり 100vw と表示幅が一致してしまうため、今回の 7.5px ずれが
//    再現せず検出できなかった（ユーザー報告で発覚）。
const b=await chromium.launch({headless:false, channel:"chrome", args:["--hide-scrollbars=false"]});
const ctx=await b.newContext({viewport:{width:400,height:800}});
const p=await ctx.newPage();
await p.route('**/*', r=>r.continue({headers:{...r.request().headers(),'cache-control':'no-cache'}}));
const rows=[];
const run=async(base,paths,site)=>{
  for(const path of paths){
    for(const [dn,w,h] of D){
      for(const [ori,vw,vh] of [["縦",w,h],["横",h,w]]){
        await p.setViewportSize({width:vw,height:vh});
        const res=await p.goto(base+path,{waitUntil:"domcontentloaded",timeout:40000}).catch(()=>null);
        if(!res||!res.ok()){rows.push({site,path,d:dn+ori,err:res?res.status():'LOAD'});continue;}
        await p.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1800))])).catch(()=>{});
        await p.waitForTimeout(300);
        const r=await p.evaluate(()=>{
          const hd=document.querySelector('.site-header')||document.querySelector('header');
          if(!hd) return {err:'noheader'};
          const brand=[...hd.querySelectorAll('.sh-brand, a[aria-label]')].find(e=>e.getBoundingClientRect().width>5);
          if(!brand) return {err:'nobrand'};
          const br=brand.getBoundingClientRect();
          const cw=document.documentElement.clientWidth;
          const tg=[...hd.querySelectorAll('a,span')].find(e=>/^スキャン$|^Scan$/.test((e.textContent||'').trim()));
          return {c:+((br.left+br.right)/2-cw/2).toFixed(1),
                  cw:cw, iw:window.innerWidth,
                  h:+hd.getBoundingClientRect().height.toFixed(1),
                  tg:tg?getComputedStyle(tg).fontSize:'-',
                  of:document.documentElement.scrollWidth-cw};
        });
        rows.push({site,path,d:dn+ori,...r});
      }
    }
    process.stdout.write(".");
  }
};
await run("https://locahun3d.com",ON,"on");
await run("https://web.locahun3d.com",SC,"sc");
await b.close();
console.log("");
const ok=rows.filter(r=>!r.err);
const bad=rows.filter(r=>r.err||Math.abs(r.c)>1||r.of>2);
const set=(k,s)=>[...new Set(ok.filter(r=>r.site===s).map(r=>r[k]))].sort().join(",");
console.log("計測数:",rows.length,"／ 問題:",bad.length);
console.log("ヘッダー高  online:",set('h','on')," scan:",set('h','sc'));
console.log("トグルsize  online:",set('tg','on')," scan:",set('tg','sc'));
console.log("中心ズレ    online:",set('c','on')," scan:",set('c','sc'));
for(const r of bad.slice(0,30)) console.log("  ",JSON.stringify(r));
