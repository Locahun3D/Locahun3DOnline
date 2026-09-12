import { chromium, webkit } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const out = process.env.OUT || 'F:/Codex/header-scroll-20260912';
await mkdir(out, {recursive:true});
const base = process.env.BASE_URL || 'http://localhost:3032';
const engine = process.env.WEBKIT ? webkit : chromium;
const browser = await engine.launch(process.env.WEBKIT ? {headless:false} : {channel:'chrome',headless:false});
try {
  for (const [width,height] of [[390,844],[820,1180],[1180,820],[1440,900]]) {
    const page = await browser.newPage({viewport:{width,height}});
    for (const path of (process.env.PATHS || '/pricing,/works/index.html,/works/3dgs-blender-workflow.html').split(',')) {
      await page.goto(base+path, {waitUntil:'domcontentloaded', timeout:60000});
      await page.waitForTimeout(1200);
      for (const y of [0,400,1200,600,100,0]) {
        await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),y);
        await page.waitForTimeout(120);
        const state=await page.evaluate(()=>{
          const h=document.querySelector('body header'); const r=h.getBoundingClientRect(); const c=getComputedStyle(h);
          return {scroll:scrollY,top:r.top,bottom:r.bottom,height:r.height,bg:c.backgroundColor,zoom:c.zoom,rootZoom:getComputedStyle(document.documentElement).zoom,filter:c.backdropFilter,position:c.position,hit:document.elementFromPoint(innerWidth/2,1)?.tagName,visualTop:visualViewport.offsetTop};
        });
        console.log(JSON.stringify({width,path,y,...state}));
        if (!process.env.DIAGNOSE) {
          assert.equal(state.top,0, 'header must touch viewport top');
          assert.equal(state.height,56, 'header must keep physical size');
          assert.equal(state.bg,'rgb(0, 0, 0)', 'header must be fully opaque at every width, including landscape iPad');
          assert.equal(state.filter,'none', 'header must not sample scrolled content');
        }
        if(y===600) {
          const png=await page.screenshot({path:`${out}/${process.env.WEBKIT?'webkit':'chrome'}-${width}-${path.split('/').pop().replace('.html','')}.png`});
          const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
          // The top three device-pixel rows contain no typography. Sample the
          // rendered surface, not just CSS, to catch gaps/underlying content.
          let maximum=0;
          for(let yy=0;yy<3;yy++) for(let xx=25;xx<info.width-25;xx++) {
            const i=(yy*info.width+xx)*info.channels;
            maximum=Math.max(maximum,...data.subarray(i,i+3));
          }
          console.log(JSON.stringify({width,path,topEdgeMaxChannel:maximum}));
          if(!process.env.DIAGNOSE) assert.ok(maximum<=2,'top edge must render solid black');
        }
      }
      await page.evaluate(()=>{
        window.__headerFrames=[];
        window.__sampleHeader=true;
        const sample=()=>{
          if(!window.__sampleHeader)return;
          const h=document.querySelector('body header'); const r=h.getBoundingClientRect();
          const brand=h.querySelector('a:has(svg)');
          window.__headerFrames.push({top:r.top,height:r.height,covered:h.contains(document.elementFromPoint(innerWidth/2,1)),center:brand?brand.getBoundingClientRect().x+brand.getBoundingClientRect().width/2:null});
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      for(const delta of [900,900,-700,-1100]) {await page.mouse.wheel(0,delta);await page.waitForTimeout(220);}
      const frames=await page.evaluate(()=>{window.__sampleHeader=false;return window.__headerFrames;});
      if(!process.env.DIAGNOSE) assert.ok(frames.length>5 && frames.every(f=>f.top===0 && f.height===56 && f.covered),'header must cover viewport top throughout wheel scrolling');
      console.log(JSON.stringify({width,path,frames:frames.length,badFrames:frames.filter(f=>f.top!==0||!f.covered).length}));
    }
    await page.close();
  }
} finally {await browser.close();}
